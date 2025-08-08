import { endOfWeek, isWithinInterval } from 'date-fns';
import { Database, type ShiftOccurrence, type StaffMember } from '../storage/database-pouchdb';
import type { TFunction } from 'i18next';
import { constraintEngine, type ConstraintContext } from './constraints';
import { formatLocalizedDateTime } from './datetime';

// Legacy violation format for backward compatibility
interface LegacyViolation {
  staffId: string;
  staffName: string;
  violationType: string;
  details: string;
}

// Translation function type
export type TranslationFunction = TFunction;

export interface SchedulingResult {
  success: boolean;
  assignments: { [occurrenceId: string]: string[] };
  warnings: string[];
  errors: string[];
}

function unfulfilledTraitRequirements(
  occurrence: ShiftOccurrence,
  allStaff: StaffMember[]
): number {
  let missing = 0
  if (occurrence.requirements.requiredTraits) {
    for (const requiredTrait of occurrence.requirements.requiredTraits) {
      const assignedStaff = allStaff.filter(staff => occurrence.assignedStaff.includes(staff.id))

      const assignedCount = assignedStaff.filter(staff => staff.traitIds.includes(requiredTrait.traitId)).length;
      if (assignedCount < requiredTrait.minCount) {
        missing += requiredTrait.minCount - assignedCount;
      }
    }
  }
  
  return missing;
}

function hasRequiredTraits(
  staffMember: StaffMember,
  traitIds: string[]
): number {
  return traitIds.filter(id => staffMember.traitIds.includes(id)).length;
}


// Check if staff member is available for a shift occurrence using centralized constraint engine
function isStaffAvailable(
  staffMember: StaffMember,
  occurrence: ShiftOccurrence,
  allStaff: StaffMember[],
  allOccurrences: ShiftOccurrence[],
  weekStart: Date,
  t: TFunction,
  language: string
): { available: boolean; violations: LegacyViolation[] } {
  // Create constraint context for the centralized engine
  const context: ConstraintContext = {
    targetStaff: staffMember,
    targetOccurrence: occurrence,
    allStaff,
    allOccurrences,
    evaluationDate: weekStart,
    t,
    language,
    mode: 'check_assignment'  // Check if adding this assignment would violate constraints
  };
  
  // Use the centralized constraint engine
  const violations = constraintEngine.validateStaffAssignment(context);
  // Convert to legacy format for compatibility with existing code
  const legacyViolations = violations.map(v => ({
    staffId: v.staffId,
    staffName: v.staffName,
    violationType: v.violationType === 'blocked_time' ? 'blocked_time' :
                   v.violationType === 'incompatible_staff' ? 'incompatible' :
                   v.violationType === 'daily_shift_limit' ? 'daily_limit' :
                   v.violationType === 'weekly_shift_limit' ? 'weekly_limit' :
                   v.violationType === 'monthly_shift_limit' ? 'monthly_limit' :
                   v.violationType === 'yearly_shift_limit' ? 'yearly_limit' :
                   v.violationType,
    details: v.message
  }));
  
  // Only consider error-level violations as blocking (not warnings)
  const errorViolations = violations.filter(v => v.severity === 'error');
  
  return { 
    available: errorViolations.length === 0, 
    violations: legacyViolations 
  };
}

// Calculate priority score for staff assignment (higher is better)
function calculateStaffPriority(
  staffMember: StaffMember, 
  occurrence: ShiftOccurrence, 
  allOccurrences: ShiftOccurrence[],
  assignments: { [occurrenceId: string]: string[] }
): number {
  let score = 100;
  
  const hasIrrelevantTraits = staffMember.traitIds.length > 0 && occurrence.requirements.requiredTraits?.some(t => staffMember.traitIds.includes(t.traitId)) === false;

  // De-prioritize staff with traits, if that shift doesn't require them
  
  if (hasIrrelevantTraits) {
    score -= 50;
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
  score += staffMember.constraints.maxShiftsPerWeek ?? 0;
  score += staffMember.constraints.maxShiftsPerMonth ?? 0;
  score += staffMember.constraints.maxShiftsPerYear ?? 0;
  
  return score;
}

// Auto-schedule staff to shifts for the given week
export async function autoScheduleWeek(
  shiftOccurrences: ShiftOccurrence[],
  staff: StaffMember[],
  weekStart: Date,
  t: TFunction,
  language: string
): Promise<SchedulingResult> {
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

  // Sort occurrences by start time to schedule chronologically
  const sortedOccurrences = [...weekOccurrences].sort((a, b) => 
    a.startDateTime.getTime() - b.startDateTime.getTime()
  );
  
  // Try to fill each shift
  for (const occurrence of sortedOccurrences) {
    const neededStaff = occurrence.requirements.staffCount - occurrence.assignedStaff.length;
    
    if (neededStaff <= 0) continue; // Shift already fully staffed

    let assigned = 0;

    while (occurrence.assignedStaff.length < occurrence.requirements.staffCount){
      const remainingNeeded = occurrence.requirements.staffCount - occurrence.assignedStaff.length;
      const candidates = staff
        .filter(c => !occurrence.assignedStaff.includes(c.id))
        .filter(c => isStaffAvailable(c, occurrence, staff, sortedOccurrences, weekStart, t, language).available)
        .filter(c => (unfulfilledTraitRequirements(occurrence, staff) / remainingNeeded) <= hasRequiredTraits(c, occurrence.requirements.requiredTraits?.map(t => t.traitId) ?? []))

      candidates.sort((a, b) =>
        calculateStaffPriority(a, occurrence, sortedOccurrences, result.assignments) -
        calculateStaffPriority(b, occurrence, sortedOccurrences, result.assignments)
      )

      const bestCandidate = candidates[0];
      if (!bestCandidate) {
        // no candidate left
        break;
      }
      
      occurrence.assignedStaff.push(bestCandidate.id);

      assigned++;
    }

    const remainingNeeded = neededStaff - assigned;
    
    // Check if shift was properly staffed (only report this error if trait requirements were met)
    if (remainingNeeded > 0) {
      result.success = false;
      const errorMessage = t
        ? t('autoScheduler.understaffedError', {
            shiftName: occurrence.name,
            date: formatLocalizedDateTime(occurrence.startDateTime, language),
            assigned: occurrence.assignedStaff.length + assigned,
            required: occurrence.requirements.staffCount
          })
        : `Could not fully staff shift "${occurrence.name}" on ${formatLocalizedDateTime(occurrence.startDateTime, language)} - assigned ${occurrence.assignedStaff.length + assigned}/${occurrence.requirements.staffCount} staff`;
      result.errors.push(errorMessage);
    }
    Database.saveShiftOccurrence(occurrence);
  }
  
  return result;
}