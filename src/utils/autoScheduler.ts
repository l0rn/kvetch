import { startOfWeek, endOfWeek, isWithinInterval, parseISO, format, startOfDay, getMonth, getYear } from 'date-fns';
import type { ShiftOccurrence, StaffMember, Trait } from '../storage/database-pouchdb';
import type { TFunction } from 'i18next';

// Translation function type
export type TranslationFunction = TFunction;

export interface SchedulingResult {
  success: boolean;
  assignments: { [occurrenceId: string]: string[] };
  warnings: string[];
  errors: string[];
}

export interface ConstraintViolation {
  staffId: string;
  staffName: string;
  violationType: 'incompatible' | 'blocked_time' | 'daily_limit' | 'weekly_limit' | 'monthly_limit' | 'yearly_limit';
  details: string;
}

// Generate all blocked time occurrences for a staff member within the given time range
function generateBlockedTimeOccurrences(
  staffMember: StaffMember, 
  startDate: Date, 
  endDate: Date
): Array<{ startDateTime: Date; endDateTime: Date }> {
  const occurrences: Array<{ startDateTime: Date; endDateTime: Date }> = [];
  
  for (const blockedTime of staffMember.blockedTimes) {
    if (!blockedTime.recurrence) {
      // Include blocked time if it overlaps with the date range at all
      if (blockedTime.startDateTime < endDate && blockedTime.endDateTime > startDate) {
        occurrences.push({
          startDateTime: blockedTime.startDateTime,
          endDateTime: blockedTime.endDateTime
        });
      }
    } else {
      // Recurring blocked time - similar logic to shift recurrence
      const baseStart = blockedTime.startDateTime;
      const baseEnd = blockedTime.endDateTime;
      const duration = baseEnd.getTime() - baseStart.getTime();
      
      const current = new Date(baseStart);
      const recurrenceEnd = blockedTime.recurrence.endDate ? blockedTime.recurrence.endDate : endDate;
      
      while (current <= recurrenceEnd && current <= endDate) {
        const occEnd = new Date(current.getTime() + duration);
        
        // Include if this occurrence overlaps with the date range
        if (current < endDate && occEnd > startDate) {
          occurrences.push({
            startDateTime: current,
            endDateTime: occEnd
          });
        }
        
        // Move to next occurrence
        const { type, interval } = blockedTime.recurrence;
        switch (type) {
          case 'daily':
            current.setDate(current.getDate() + interval);
            break;
          case 'weekly':
            current.setDate(current.getDate() + (interval * 7));
            break;
          case 'monthly':
            current.setMonth(current.getMonth() + interval);
            break;
        }
      }
    }
  }
  
  return occurrences;
}

// Check if staff member is available for a shift occurrence
function isStaffAvailable(
  staffMember: StaffMember,
  occurrence: ShiftOccurrence,
  allOccurrences: ShiftOccurrence[],
  assignments: { [occurrenceId: string]: string[] },
  weekStart: Date,
  weekEnd: Date
): { available: boolean; violations: ConstraintViolation[] } {
  const violations: ConstraintViolation[] = [];
  
  const shiftStart = occurrence.startDateTime;
  const shiftEnd = occurrence.endDateTime;
  
  // Check blocked times
  const blockedOccurrences = generateBlockedTimeOccurrences(staffMember, weekStart, weekEnd);
  for (const blocked of blockedOccurrences) {
    const blockedStart = blocked.startDateTime;
    const blockedEnd = blocked.endDateTime;
    
    // Check for overlap
    if (shiftStart < blockedEnd && shiftEnd > blockedStart) {
      violations.push({
        staffId: staffMember.id,
        staffName: staffMember.name,
        violationType: 'blocked_time',
        details: `Has blocked time from ${format(blockedStart, 'HH:mm')} to ${format(blockedEnd, 'HH:mm')} on ${format(blockedStart, 'yyyy-MM-dd')}`
      });
    }
  }
  
  // Check incompatible staff constraints
  const currentAssignments = assignments[occurrence.id] || [];
  for (const assignedStaffId of currentAssignments) {
    if (staffMember.constraints.incompatibleWith.includes(assignedStaffId)) {
      violations.push({
        staffId: staffMember.id,
        staffName: staffMember.name,
        violationType: 'incompatible',
        details: `Cannot work with assigned staff member`
      });
    }
    
    // Check if assigned staff is incompatible with this staff
    // This would require access to all staff data, which we'll handle in the main function
  }
  
  // Check shift limits
  const shiftDate = startOfDay(shiftStart);
  const shiftWeekStart = startOfWeek(shiftStart);
  const shiftMonth = getMonth(shiftStart);
  const shiftYear = getYear(shiftStart);
  
  // Count existing assignments
  let dailyCount = 0;
  let weeklyCount = 0;
  let monthlyCount = 0;
  let yearlyCount = 0;
  
  for (const occ of allOccurrences) {
    const assigned = assignments[occ.id] || [];
    if (assigned.includes(staffMember.id)) {
      const occDate = occ.startDateTime;
      const occDayStart = startOfDay(occDate);
      
      if (occDayStart.getTime() === shiftDate.getTime()) {
        dailyCount++;
      }
      
      if (startOfWeek(occDate).getTime() === shiftWeekStart.getTime()) {
        weeklyCount++;
      }
      
      if (getMonth(occDate) === shiftMonth && getYear(occDate) === shiftYear) {
        monthlyCount++;
      }
      
      if (getYear(occDate) === shiftYear) {
        yearlyCount++;
      }
    }
  }
  
  // Check daily limit (assume max 1 per day if not specified)
  const dailyMax = staffMember.constraints.maxShiftsPerDay ?? 1;
  if (dailyCount >= dailyMax) {
    violations.push({
      staffId: staffMember.id,
      staffName: staffMember.name,
      violationType: 'daily_limit',
      details: `Would exceed daily limit (${dailyCount + 1}/${dailyMax} shifts on ${format(shiftDate, 'yyyy-MM-dd')})`
    });
  }
  
  // Check weekly limit (default from WeeklyPlanningView)
  const weeklyMax = staffMember.constraints.maxShiftsPerWeek ?? 5;
  if (weeklyCount >= weeklyMax) {
    violations.push({
      staffId: staffMember.id,
      staffName: staffMember.name,
      violationType: 'weekly_limit',
      details: `Would exceed weekly limit (${weeklyCount + 1}/${weeklyMax} shifts in week of ${format(shiftWeekStart, 'yyyy-MM-dd')})`
    });
  }
  
  // Check monthly limit (default from WeeklyPlanningView)  
  const monthlyMax = staffMember.constraints.maxShiftsPerMonth ?? 21;
  if (monthlyCount >= monthlyMax) {
    violations.push({
      staffId: staffMember.id,
      staffName: staffMember.name,
      violationType: 'monthly_limit',
      details: `Would exceed monthly limit (${monthlyCount + 1}/${monthlyMax} shifts in ${format(shiftStart, 'MMMM yyyy')})`
    });
  }
  
  // Check yearly limit
  if (staffMember.constraints.maxShiftsPerYear && yearlyCount >= staffMember.constraints.maxShiftsPerYear) {
    violations.push({
      staffId: staffMember.id,
      staffName: staffMember.name,
      violationType: 'yearly_limit',
      details: `Would exceed yearly limit (${yearlyCount + 1}/${staffMember.constraints.maxShiftsPerYear} shifts in ${shiftYear})`
    });
  }
  
  return { available: violations.length === 0, violations };
}

// Check if staff member has required traits for the shift
function hasRequiredTraits(staffMember: StaffMember, occurrence: ShiftOccurrence): boolean {
  if (!occurrence.requirements.requiredTraits || occurrence.requirements.requiredTraits.length === 0) {
    return true;
  }
  
  for (const requiredTrait of occurrence.requirements.requiredTraits) {
    if (!staffMember.traitIds.includes(requiredTrait.traitId)) {
      return false;
    }
  }
  
  return true;
}

// Calculate priority score for staff assignment (higher is better)
function calculateStaffPriority(
  staffMember: StaffMember, 
  occurrence: ShiftOccurrence, 
  allOccurrences: ShiftOccurrence[],
  assignments: { [occurrenceId: string]: string[] }
): number {
  let score = 100;
  
  // Prefer staff with required traits
  if (hasRequiredTraits(staffMember, occurrence)) {
    score += 50;
  }
  
  // Prefer staff with fewer current assignments (load balancing)
  let currentAssignmentCount = 0;
  for (const occ of allOccurrences) {
    const assigned = assignments[occ.id] || [];
    if (assigned.includes(staffMember.id)) {
      currentAssignmentCount++;
    }
  }
  score -= currentAssignmentCount * 5;
  
  // Prefer staff with higher shift limits (more flexible)
  const weeklyMax = staffMember.constraints.maxShiftsPerWeek ?? 5;
  score += weeklyMax;
  
  return score;
}

// Auto-schedule staff to shifts for the given week
export function autoScheduleWeek(
  shiftOccurrences: ShiftOccurrence[],
  staff: StaffMember[],
  weekStart: Date,
  traits: Trait[],
  t?: TFunction
): SchedulingResult {
  const result: SchedulingResult = {
    success: true,
    assignments: {},
    warnings: [],
    errors: []
  };
  
  const weekEnd = endOfWeek(weekStart);
  
  // Filter occurrences for the current week
  const weekOccurrences = shiftOccurrences.filter(occ => {
    const occStart = occ.startDateTime;
    return isWithinInterval(occStart, { start: weekStart, end: weekEnd });
  });
  
  // Initialize assignments with existing assignments, but remove staff that now violate hard constraints
  for (const occurrence of weekOccurrences) {
    const validAssignments: string[] = [];
    
    for (const staffId of occurrence.assignedStaff) {
      const staffMember = staff.find(s => s.id === staffId);
      if (staffMember) {
        const availability = isStaffAvailable(staffMember, occurrence, weekOccurrences, {}, weekStart, weekEnd);
        const hasBlockedTimeViolation = availability.violations.some(v => v.violationType === 'blocked_time');
        const hasDailyLimitViolation = availability.violations.some(v => v.violationType === 'daily_limit');
        
        if (!hasBlockedTimeViolation && !hasDailyLimitViolation) {
          validAssignments.push(staffId);
        } else {
          // Log removal of staff due to constraint violations
          const violationDetails = availability.violations
            .filter(v => v.violationType === 'blocked_time' || v.violationType === 'daily_limit')
            .map(v => v.details)
            .join(', ');
          const warningMessage = t 
            ? t('autoScheduler.removedStaff', {
                staffName: staffMember.name,
                shiftName: occurrence.name,
                date: format(occurrence.startDateTime, 'yyyy-MM-dd HH:mm'),
                reasons: violationDetails
              })
            : `Removed ${staffMember.name} from shift "${occurrence.name}" on ${format(occurrence.startDateTime, 'yyyy-MM-dd HH:mm')} due to: ${violationDetails}`;
          result.warnings.push(warningMessage);
        }
      }
    }
    
    result.assignments[occurrence.id] = validAssignments;
  }
  
  // Sort occurrences by start time to schedule chronologically
  const sortedOccurrences = [...weekOccurrences].sort((a, b) => 
    a.startDateTime.getTime() - b.startDateTime.getTime()
  );
  
  // Try to fill each shift
  for (const occurrence of sortedOccurrences) {
    const currentAssignments = result.assignments[occurrence.id];
    const neededStaff = occurrence.requirements.staffCount - currentAssignments.length;
    
    if (neededStaff <= 0) continue; // Shift already fully staffed
    
    // Create candidate list with priorities
    const candidates: Array<{ staff: StaffMember; priority: number; violations: ConstraintViolation[] }> = [];
    
    for (const staffMember of staff) {
      // Skip if already assigned to this shift
      if (currentAssignments.includes(staffMember.id)) continue;
      
      const availability = isStaffAvailable(staffMember, occurrence, weekOccurrences, result.assignments, weekStart, weekEnd);
      const priority = calculateStaffPriority(staffMember, occurrence, weekOccurrences, result.assignments);
      
      candidates.push({
        staff: staffMember,
        priority,
        violations: availability.violations
      });
    }
    
    // Sort by priority (highest first) and availability (available first)
    candidates.sort((a, b) => {
      if (a.violations.length === 0 && b.violations.length > 0) return -1;
      if (a.violations.length > 0 && b.violations.length === 0) return 1;
      return b.priority - a.priority;
    });
    
    let assigned = 0;
    let traitRequirementsMet = true;
    
    // FIRST PHASE: Fill trait requirements
    if (occurrence.requirements.requiredTraits) {
      for (const requiredTrait of occurrence.requirements.requiredTraits) {
        const trait = traits.find(t => t.id === requiredTrait.traitId);
        const traitName = trait?.name || 'Unknown Trait';
        
        // Count how many staff with this trait are already assigned
        const alreadyAssignedWithTrait = result.assignments[occurrence.id].filter(staffId => {
          const staffMember = staff.find(s => s.id === staffId);
          return staffMember?.traitIds.includes(requiredTrait.traitId);
        }).length;
        
        const stillNeededWithTrait = requiredTrait.minCount - alreadyAssignedWithTrait;
        
        if (stillNeededWithTrait > 0) {
          // Find candidates with this specific trait
          const traitCandidates = candidates.filter(candidate => 
            candidate.staff.traitIds.includes(requiredTrait.traitId)
          );
          
          let assignedWithTrait = 0;
          for (const candidate of traitCandidates) {
            if (assignedWithTrait >= stillNeededWithTrait) break;
            if (assigned >= neededStaff) break;
            
            // Check for hard constraint violations (blocked time, daily limits)
            const hasBlockedTimeViolation = candidate.violations.some(v => v.violationType === 'blocked_time');
            const hasDailyLimitViolation = candidate.violations.some(v => v.violationType === 'daily_limit');
            
            if (hasBlockedTimeViolation || hasDailyLimitViolation) {
              continue; // Skip staff with hard constraint violations
            }
            
            // Check for incompatibility
            let incompatible = false;
            for (const assignedStaffId of result.assignments[occurrence.id]) {
              const assignedStaff = staff.find(s => s.id === assignedStaffId);
              if (assignedStaff && (
                assignedStaff.constraints.incompatibleWith.includes(candidate.staff.id) ||
                candidate.staff.constraints.incompatibleWith.includes(assignedStaffId)
              )) {
                incompatible = true;
                break;
              }
            }
            
            if (!incompatible) {
              result.assignments[occurrence.id].push(candidate.staff.id);
              assigned++;
              assignedWithTrait++;
              
              // Remove this candidate from the general pool
              const candidateIndex = candidates.indexOf(candidate);
              candidates.splice(candidateIndex, 1);
              
              // Add warnings for soft constraint violations (weekly, monthly, yearly limits)
              for (const violation of candidate.violations) {
                if (violation.violationType !== 'blocked_time' && violation.violationType !== 'daily_limit') {
                  const warningMessage = t
                    ? t('autoScheduler.constraintViolation', {
                        staffName: violation.staffName,
                        violation: violation.details
                      })
                    : `${violation.staffName}: ${violation.details} for shift "${occurrence.name}" on ${format(occurrence.startDateTime, 'yyyy-MM-dd HH:mm')}`;
                  result.warnings.push(warningMessage);
                }
              }
            }
          }
          
          // Check if we met the trait requirement
          if (assignedWithTrait < stillNeededWithTrait) {
            traitRequirementsMet = false;
            result.success = false;
            const errorMessage = t
              ? t('autoScheduler.traitRequirementError', {
                  shiftName: occurrence.name,
                  date: format(occurrence.startDateTime, 'yyyy-MM-dd HH:mm'),
                  required: requiredTrait.minCount,
                  traitName,
                  assigned: alreadyAssignedWithTrait + assignedWithTrait
                })
              : `Shift "${occurrence.name}" on ${format(occurrence.startDateTime, 'yyyy-MM-dd HH:mm')} requires ${requiredTrait.minCount} staff with "${traitName}" trait, but only ${alreadyAssignedWithTrait + assignedWithTrait} could be assigned`;
            result.errors.push(errorMessage);
          }
        }
      }
    }
    
    // SECOND PHASE: Fill remaining positions with any available staff (only if trait requirements are met or there are no trait requirements)
    const remainingNeeded = neededStaff - assigned;
    if (remainingNeeded > 0 && (traitRequirementsMet || !occurrence.requirements.requiredTraits)) {
      for (const candidate of candidates) {
        if (assigned >= neededStaff) break;
        
        // Check for hard constraint violations (blocked time, daily limits)
        const hasBlockedTimeViolation = candidate.violations.some(v => v.violationType === 'blocked_time');
        const hasDailyLimitViolation = candidate.violations.some(v => v.violationType === 'daily_limit');
        
        if (hasBlockedTimeViolation || hasDailyLimitViolation) {
          continue; // Skip staff with hard constraint violations
        }
        
        // Check for incompatibility
        let incompatible = false;
        for (const assignedStaffId of result.assignments[occurrence.id]) {
          const assignedStaff = staff.find(s => s.id === assignedStaffId);
          if (assignedStaff && (
            assignedStaff.constraints.incompatibleWith.includes(candidate.staff.id) ||
            candidate.staff.constraints.incompatibleWith.includes(assignedStaffId)
          )) {
            incompatible = true;
            break;
          }
        }
        
        if (!incompatible) {
          result.assignments[occurrence.id].push(candidate.staff.id);
          assigned++;
          
          // Add warnings for soft constraint violations (weekly, monthly, yearly limits)
          for (const violation of candidate.violations) {
            if (violation.violationType !== 'blocked_time' && violation.violationType !== 'daily_limit') {
              const warningMessage = t
                ? t('autoScheduler.constraintViolation', {
                    staffName: violation.staffName,
                    violation: violation.details
                  })
                : `${violation.staffName}: ${violation.details} for shift "${occurrence.name}" on ${format(occurrence.startDateTime, 'yyyy-MM-dd HH:mm')}`;
              result.warnings.push(warningMessage);
            }
          }
        }
      }
    }
    
    // Check if shift was properly staffed (only report this error if trait requirements were met)
    if (assigned < neededStaff && traitRequirementsMet) {
      result.success = false;
      const errorMessage = t
        ? t('autoScheduler.understaffedError', {
            shiftName: occurrence.name,
            date: format(occurrence.startDateTime, 'yyyy-MM-dd HH:mm'),
            assigned: currentAssignments.length + assigned,
            required: occurrence.requirements.staffCount
          })
        : `Could not fully staff shift "${occurrence.name}" on ${format(occurrence.startDateTime, 'yyyy-MM-dd HH:mm')} - assigned ${currentAssignments.length + assigned}/${occurrence.requirements.staffCount} staff`;
      result.errors.push(errorMessage);
    }
  }
  
  return result;
}