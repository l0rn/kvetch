import type { ShiftOccurrence, StaffMember, Trait } from '../storage/database-pouchdb';
import { addDays, addWeeks, addMonths, isBefore, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';

export interface StaffingStatus {
  status: 'properly-staffed' | 'understaffed' | 'overstaffed' | 'not-staffed' | 'constraint-violation';
  color: 'green' | 'orange' | 'red';
  message: string;
  missingTraits?: Array<{
    traitName: string;
    required: number;
    assigned: number;
  }>;
  constraintViolations?: Array<{
    staffMemberName: string;
    violationType: 'incompatible-staff' | 'blocked-time' | 'shift-count';
    violationMessage: string;
  }>;
}

// Helper function to generate blocked time occurrences from recurrence
function generateBlockedTimeOccurrences(blockedTime: StaffMember['blockedTimes'][0], maxDate: Date): Array<{startDateTime: Date, endDateTime: Date}> {
  const occurrences = [];
  const startDate = blockedTime.startDateTime;
  const endDate = blockedTime.endDateTime;
  
  // Always include the original blocked time
  occurrences.push({
    startDateTime: blockedTime.startDateTime,
    endDateTime: blockedTime.endDateTime
  });
  
  // Generate recurring occurrences if recurrence is defined
  if (blockedTime.recurrence) {
    const { type, interval, endDate: recurrenceEndDate } = blockedTime.recurrence;
    const recurrenceEnd = recurrenceEndDate ? recurrenceEndDate : maxDate;
    
    let currentStart = startDate;
    let currentEnd = endDate;
    
    while (isBefore(currentStart, recurrenceEnd) && isBefore(currentStart, maxDate)) {
      // Calculate next occurrence
      switch (type) {
        case 'daily':
          currentStart = addDays(currentStart, interval);
          currentEnd = addDays(currentEnd, interval);
          break;
        case 'weekly':
          currentStart = addWeeks(currentStart, interval);
          currentEnd = addWeeks(currentEnd, interval);
          break;
        case 'monthly':
          currentStart = addMonths(currentStart, interval);
          currentEnd = addMonths(currentEnd, interval);
          break;
      }
      
      if (isBefore(currentStart, recurrenceEnd) && isBefore(currentStart, maxDate)) {
        occurrences.push({
          startDateTime: currentStart,
          endDateTime: currentEnd
        });
      }
    }
  }
  
  return occurrences;
}

// Helper function to check if two time periods overlap
function timePeriodsOverlap(
  start1: Date, end1: Date, 
  start2: Date, end2: Date
): boolean {
  return start1 < end2 && start2 < end1;
}

// Helper function to check blocked time constraint violations
function checkBlockedTimeViolations(
  occurrence: ShiftOccurrence,
  assignedStaff: StaffMember[],
  language?: string
): Array<{staffMemberName: string, violationType: 'blocked-time', violationMessage: string}> {
  const violations = [];
  const shiftStart = occurrence.startDateTime;
  const shiftEnd = occurrence.endDateTime;
  
  // Look ahead 1 year for blocked time occurrences
  const maxDate = addDays(shiftStart, 365);
  
  for (const staffMember of assignedStaff) {
    for (const blockedTime of staffMember.blockedTimes) {
      const blockedOccurrences = generateBlockedTimeOccurrences(blockedTime, maxDate);
      
      for (const blockedOccurrence of blockedOccurrences) {
        const blockedStart = blockedOccurrence.startDateTime;
        const blockedEnd = blockedOccurrence.endDateTime;
        
        if (timePeriodsOverlap(shiftStart, shiftEnd, blockedStart, blockedEnd)) {
          violations.push({
            staffMemberName: staffMember.name,
            violationType: 'blocked-time' as const,
            violationMessage: `has blocked time from ${blockedStart.toLocaleDateString(language)} ${blockedStart.toLocaleTimeString(language, {hour: '2-digit', minute: '2-digit'})} to ${blockedEnd.toLocaleDateString(language)} ${blockedEnd.toLocaleTimeString(language, {hour: '2-digit', minute: '2-digit'})}`
          });
          break; // Only report the first violation per staff member
        }
      }
    }
  }
  
  return violations;
}

// Helper function to check incompatible staff constraint violations  
function checkIncompatibleStaffViolations(
  assignedStaff: StaffMember[]
): Array<{staffMemberName: string, violationType: 'incompatible-staff', violationMessage: string}> {
  const violations = [];
  
  for (let i = 0; i < assignedStaff.length; i++) {
    const staffMember = assignedStaff[i];
    
    for (let j = i + 1; j < assignedStaff.length; j++) {
      const otherStaffMember = assignedStaff[j];
      
      // Check if current staff member is incompatible with the other
      if (staffMember.constraints.incompatibleWith.includes(otherStaffMember.id)) {
        violations.push({
          staffMemberName: staffMember.name,
          violationType: 'incompatible-staff' as const,
          violationMessage: `cannot work with ${otherStaffMember.name}`
        });
      }
      
      // Check if the other staff member is incompatible with current (bidirectional check)
      if (otherStaffMember.constraints.incompatibleWith.includes(staffMember.id)) {
        violations.push({
          staffMemberName: otherStaffMember.name,
          violationType: 'incompatible-staff' as const,
          violationMessage: `cannot work with ${staffMember.name}`
        });
      }
    }
  }
  
  return violations;
}

// Helper function to check shift count constraint violations
function checkShiftCountViolations(
  occurrence: ShiftOccurrence,
  assignedStaff: StaffMember[],
  allShiftOccurrences: ShiftOccurrence[],
  language?: string
): Array<{staffMemberName: string, violationType: 'shift-count', violationMessage: string}> {
  const violations = [];
  const occurrenceDate = occurrence.startDateTime;
  
  for (const staffMember of assignedStaff) {
    const constraints = staffMember.constraints;
    
    // Get default values (1 shift per day by default, unlimited for others)
    const maxPerDay = constraints.maxShiftsPerDay ?? 1;
    const maxPerWeek = constraints.maxShiftsPerWeek ?? Infinity;
    const maxPerMonth = constraints.maxShiftsPerMonth ?? Infinity;
    const maxPerYear = constraints.maxShiftsPerYear ?? Infinity;
    
    // Count existing shifts for this staff member in different time periods
    // (including the current occurrence being checked)
    const shiftsOnSameDay = allShiftOccurrences.filter(occ => {
      const occDate = occ.startDateTime;
      return occ.assignedStaff.includes(staffMember.id) &&
             occDate >= startOfDay(occurrenceDate) &&
             occDate <= endOfDay(occurrenceDate);
    }).length;
    
    const shiftsInSameWeek = allShiftOccurrences.filter(occ => {
      const occDate = occ.startDateTime;
      return occ.assignedStaff.includes(staffMember.id) &&
             occDate >= startOfWeek(occurrenceDate) &&
             occDate <= endOfWeek(occurrenceDate);
    }).length;
    
    const shiftsInSameMonth = allShiftOccurrences.filter(occ => {
      const occDate = occ.startDateTime;
      return occ.assignedStaff.includes(staffMember.id) &&
             occDate >= startOfMonth(occurrenceDate) &&
             occDate <= endOfMonth(occurrenceDate);
    }).length;
    
    const shiftsInSameYear = allShiftOccurrences.filter(occ => {
      const occDate = occ.startDateTime;
      return occ.assignedStaff.includes(staffMember.id) &&
             occDate >= startOfYear(occurrenceDate) &&
             occDate <= endOfYear(occurrenceDate);
    }).length;
    
    // Check violations
    if (shiftsOnSameDay > maxPerDay) {
      violations.push({
        staffMemberName: staffMember.name,
        violationType: 'shift-count' as const,
        violationMessage: `exceeds daily limit (${shiftsOnSameDay}/${maxPerDay} shifts on ${occurrenceDate.toLocaleDateString(language)})`
      });
    }
    
    if (shiftsInSameWeek > maxPerWeek) {
      violations.push({
        staffMemberName: staffMember.name,
        violationType: 'shift-count' as const,
        violationMessage: `exceeds weekly limit (${shiftsInSameWeek}/${maxPerWeek} shifts in week of ${startOfWeek(occurrenceDate).toLocaleDateString(language)})`
      });
    }
    
    if (shiftsInSameMonth > maxPerMonth) {
      violations.push({
        staffMemberName: staffMember.name,
        violationType: 'shift-count' as const,
        violationMessage: `exceeds monthly limit (${shiftsInSameMonth}/${maxPerMonth} shifts in ${occurrenceDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })})`
      });
    }
    
    if (shiftsInSameYear > maxPerYear) {
      violations.push({
        staffMemberName: staffMember.name,
        violationType: 'shift-count' as const,
        violationMessage: `would exceed yearly limit (${shiftsInSameYear}/${maxPerYear} shifts in ${occurrenceDate.getFullYear()})`
      });
    }
  }
  
  return violations;
}

export function calculateStaffingStatus(
  occurrence: ShiftOccurrence,
  assignedStaff: StaffMember[],
  allTraits: Trait[],
  allShiftOccurrences?: ShiftOccurrence[],
  t?: (key: string, options?: Record<string, unknown>) => string,
  language?: string
): StaffingStatus {
  const { requirements } = occurrence;
  const totalAssigned = assignedStaff.length;
  const totalRequired = requirements.staffCount;

  // Create a map of trait IDs to trait names for easy lookup
  const traitMap = new Map(allTraits.map(trait => [trait.id, trait.name]));

  // If no staff assigned at all
  if (totalAssigned === 0) {
    const message = t 
      ? t('staffing.notStaffed', { 
          count: totalRequired, 
          count_plural: totalRequired === 1 ? t('staffing.person') : t('staffing.people') 
        })
      : `This shift is not staffed (needs ${totalRequired} ${totalRequired === 1 ? 'person' : 'people'})`;
    
    return {
      status: 'not-staffed',
      color: 'red',
      message
    };
  }

  // Check trait requirements if they exist
  const missingTraits: Array<{ traitName: string; required: number; assigned: number }> = [];
  
  if (requirements.requiredTraits) {
    for (const requiredTrait of requirements.requiredTraits) {
      const staffWithTrait = assignedStaff.filter(staff => 
        staff.traitIds.includes(requiredTrait.traitId)
      );
      
      if (staffWithTrait.length < requiredTrait.minCount) {
        const traitName = traitMap.get(requiredTrait.traitId) || 'Unknown Trait';
        missingTraits.push({
          traitName,
          required: requiredTrait.minCount,
          assigned: staffWithTrait.length
        });
      }
    }
  }

  // If there are missing traits
  if (missingTraits.length > 0) {
    const missingTraitMessages = missingTraits.map(mt => 
      t ? t('staffing.missingTraitCount', { count: mt.required - mt.assigned, trait: mt.traitName })
        : `${mt.required - mt.assigned} more with ${mt.traitName}`
    );
    
    const message = t 
      ? t('staffing.missingTraits', { traits: missingTraitMessages.join(', ') })
      : `This shift is missing: ${missingTraitMessages.join(', ')}`;
    
    return {
      status: 'understaffed',
      color: 'orange',
      message,
      missingTraits
    };
  }

  // Check constraint violations
  const blockedTimeViolations = checkBlockedTimeViolations(occurrence, assignedStaff, language);
  const incompatibleStaffViolations = checkIncompatibleStaffViolations(assignedStaff);
  const shiftCountViolations = allShiftOccurrences 
    ? checkShiftCountViolations(occurrence, assignedStaff, allShiftOccurrences, language)
    : [];
  const allViolations = [...blockedTimeViolations, ...incompatibleStaffViolations, ...shiftCountViolations];

  // If there are constraint violations, prioritize them
  if (allViolations.length > 0) {
    const message = t 
      ? t('staffing.constraintViolation')
      : 'This shift violates staff constraints';
   
    return {
      status: 'constraint-violation',
      color: 'red',
      message,
      constraintViolations: allViolations
    };
  }

  // Check overall staffing levels
  if (totalAssigned < totalRequired) {
    const missing = totalRequired - totalAssigned;
    const message = t 
      ? t('staffing.understaffed', { 
          assigned: totalAssigned, 
          required: totalRequired, 
          missing, 
          missing_plural: missing === 1 ? t('staffing.person') : t('staffing.people') 
        })
      : `This shift is understaffed (${totalAssigned}/${totalRequired}, missing ${missing} ${missing === 1 ? 'person' : 'people'})`;
    
    return {
      status: 'understaffed',
      color: 'orange',
      message
    };
  } else if (totalAssigned > totalRequired) {
    const extra = totalAssigned - totalRequired;
    const message = t 
      ? t('staffing.overstaffed', { 
          assigned: totalAssigned, 
          required: totalRequired, 
          extra, 
          extra_plural: extra === 1 ? t('staffing.person') : t('staffing.people') 
        })
      : `This shift is overstaffed (${totalAssigned}/${totalRequired}, ${extra} extra ${extra === 1 ? 'person' : 'people'})`;
    
    return {
      status: 'overstaffed',
      color: 'orange',
      message
    };
  } else {
    const message = t 
      ? t('staffing.properlyStaffed')
      : 'This shift is properly staffed';
    
    return {
      status: 'properly-staffed',
      color: 'green',
      message
    };
  }
}