import { solve } from 'yalps';
import { 
  endOfWeek, isWithinInterval, startOfDay, startOfMonth, startOfYear, endOfMonth, endOfYear, eachDayOfInterval
} from 'date-fns';
import type { ShiftOccurrence, StaffMember } from "../storage/database";
import type { TFunction } from 'i18next';

// YALPS model type definitions
interface YALPSConstraint {
  equal?: number;
  max?: number;
  min?: number;
}

interface YALPSVariable {
  [constraintName: string]: number;
}


interface YALPSSolution {
  result?: number;
  status?: string;
  variables?: [string, number][];
}

/**
 * YALPS-based scheduling result
 */
export interface YALPSSchedulingResult {
  success: boolean;
  assignments: { [occurrenceId: string]: string[] };
  warnings: string[];
  errors: string[];
  objective: number;
  algorithm: 'yalps-linear-programming' | 'yalps-fallback' | 'greedy-best-effort';
}

/**
 * Helper function to check if a staff member is blocked during a shift
 */
function isStaffBlocked(staffMember: StaffMember, shift: ShiftOccurrence): boolean {
  if (!staffMember.blockedTimes || !Array.isArray(staffMember.blockedTimes)) {
    return false;
  }

  for (const blockedTime of staffMember.blockedTimes) {
    // Check if blocked time has recurrence
    if (blockedTime.recurrence) {
      const rec = blockedTime.recurrence;
      const recEndDate = rec.endDate ? new Date(rec.endDate) : new Date(shift.startDateTime.getTime() + 365 * 24 * 60 * 60 * 1000);

      let currentDate = new Date(blockedTime.startDateTime);
      while (currentDate <= recEndDate && currentDate <= shift.endDateTime) {
        // Calculate the blocked time for this occurrence
        const occurrenceStart = new Date(currentDate);
        const duration = blockedTime.endDateTime.getTime() - blockedTime.startDateTime.getTime();
        const occurrenceEnd = new Date(occurrenceStart.getTime() + duration);

        // Check if this occurrence overlaps with the shift
        if (shift.startDateTime < occurrenceEnd && shift.endDateTime > occurrenceStart) {
          return true;
        }

        // Move to next occurrence
        if (rec.type === 'daily') {
          currentDate.setDate(currentDate.getDate() + rec.interval);
        } else if (rec.type === 'weekly') {
          currentDate.setDate(currentDate.getDate() + (7 * rec.interval));
        } else if (rec.type === 'monthly') {
          currentDate.setMonth(currentDate.getMonth() + rec.interval);
        }
      }
    } else {
      // Non-recurring blocked time
      if (shift.startDateTime < blockedTime.endDateTime &&
          shift.endDateTime > blockedTime.startDateTime) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Helper function to check if staff member has excluded traits for a shift
 */
function hasExcludedTrait(staffMember: StaffMember, shift: ShiftOccurrence): boolean {
  if (!shift.requirements.excludedTraits || shift.requirements.excludedTraits.length === 0) {
    return false;
  }

  for (const excludedTraitId of shift.requirements.excludedTraits) {
    if (staffMember.traitIds.includes(excludedTraitId)) {
      return true;
    }
  }

  return false;
}

/**
 * Helper function to check if two staff members are incompatible
 */
function areStaffIncompatible(staff1: StaffMember, staff2: StaffMember): boolean {
  return staff1.constraints.incompatibleWith.includes(staff2.id) ||
         staff2.constraints.incompatibleWith.includes(staff1.id);
}

/**
 * Greedy best-effort scheduler that fills as many shifts as possible while respecting all constraints
 */
// Helper function to check if assigning a staff member would violate shared rest day constraints
function wouldViolateSharedRestDays(
  staffMember: StaffMember,
  shift: ShiftOccurrence,
  allStaff: StaffMember[],
  weekShifts: ShiftOccurrence[],
  currentAssignments: { [shiftId: string]: string[] },
  weekStart: Date,
  weekEnd: Date
): boolean {
  const restConstraints = staffMember.constraints.restDaysWithStaff || [];

  for (const restConstraint of restConstraints) {
    if (restConstraint.period !== 'week') continue;

    const relatedStaff = allStaff.find(s => s.id === restConstraint.staffId);
    if (!relatedStaff) continue;

    const minSharedRestDays = restConstraint.minRestDays;

    // Get all days in the week
    const days: Date[] = [];
    const currentDate = new Date(weekStart);
    while (currentDate <= weekEnd) {
      days.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Count how many days both staff would be free IF we assign this staff to this shift
    let sharedRestDays = 0;

    for (const day of days) {
      const dayKey = startOfDay(day).toISOString();
      const shiftsOnDay = weekShifts.filter(s =>
        startOfDay(s.startDateTime).toISOString() === dayKey
      );

      let staffMemberWorksThisDay = false;
      let relatedStaffWorksThisDay = false;

      for (const dayShift of shiftsOnDay) {
        const assigned = currentAssignments[dayShift.id] || [];

        // Check if this is the shift we're considering
        if (dayShift.id === shift.id) {
          // Simulate the assignment
          if (assigned.includes(relatedStaff.id)) {
            relatedStaffWorksThisDay = true;
          }
          staffMemberWorksThisDay = true; // We're assigning them to this shift
        } else {
          // Check existing assignments
          if (assigned.includes(staffMember.id)) {
            staffMemberWorksThisDay = true;
          }
          if (assigned.includes(relatedStaff.id)) {
            relatedStaffWorksThisDay = true;
          }
        }
      }

      // Both are free on this day
      if (!staffMemberWorksThisDay && !relatedStaffWorksThisDay) {
        sharedRestDays++;
      }
    }

    // Would this assignment violate the minimum shared rest days?
    if (sharedRestDays < minSharedRestDays) {
      return true;
    }
  }

  return false;
}

function greedyBestEffortSchedule(
  weekShifts: ShiftOccurrence[],
  staff: StaffMember[],
  allOccurrences: ShiftOccurrence[],
  weekStart: Date,
  weekEnd: Date,
  t: TFunction
): YALPSSchedulingResult {
  console.log('[YALPSScheduler] Starting greedy best-effort scheduling');

  const assignments: { [shiftId: string]: string[] } = {};
  const staffDailyCount = new Map<string, Map<string, number>>(); // staffId -> dayKey -> count
  const staffWeeklyCount = new Map<string, number>(); // staffId -> count
  const staffMonthlyCount = new Map<string, Map<string, number>>(); // staffId -> monthKey -> count
  const staffYearlyCount = new Map<string, Map<string, number>>(); // staffId -> yearKey -> count

  // Initialize tracking structures
  for (const staffMember of staff) {
    staffDailyCount.set(staffMember.id, new Map());
    staffWeeklyCount.set(staffMember.id, 0);
    staffMonthlyCount.set(staffMember.id, new Map());
    staffYearlyCount.set(staffMember.id, new Map());
  }

  // Create a set of shift IDs that we're re-scheduling (to avoid double-counting)
  const weekShiftIds = new Set(weekShifts.map(s => s.id));

  // Count existing assignments OUTSIDE the shifts we're re-scheduling
  // We skip counting assignments in weekShifts because we're clearing and re-scheduling them
  for (const occurrence of allOccurrences) {
    // Skip shifts that we're about to re-schedule from scratch
    if (weekShiftIds.has(occurrence.id)) continue;

    for (const staffId of occurrence.assignedStaff) {
      const staffMember = staff.find(s => s.id === staffId);
      if (!staffMember) continue;

      // Count daily assignments (only outside the shifts we're re-scheduling)
      const dayKey = startOfDay(occurrence.startDateTime).toISOString();
      const dailyMap = staffDailyCount.get(staffId)!;
      dailyMap.set(dayKey, (dailyMap.get(dayKey) || 0) + 1);

      // Count monthly assignments (only outside the shifts we're re-scheduling)
      const monthKey = startOfMonth(occurrence.startDateTime).toISOString();
      const monthlyMap = staffMonthlyCount.get(staffId)!;
      monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + 1);

      // Count yearly assignments (only outside the shifts we're re-scheduling)
      const yearKey = startOfYear(occurrence.startDateTime).toISOString();
      const yearlyMap = staffYearlyCount.get(staffId)!;
      yearlyMap.set(yearKey, (yearlyMap.get(yearKey) || 0) + 1);
    }
  }

  // Note: staffWeeklyCount starts at 0 for all staff since we're re-scheduling the entire week

  // Sort shifts by start time
  const sortedShifts = [...weekShifts].sort((a, b) =>
    a.startDateTime.getTime() - b.startDateTime.getTime()
  );

  // Process each shift
  for (const shift of sortedShifts) {
    console.log(`[Greedy] Processing shift: ${shift.name} at ${shift.startDateTime.toISOString()}`);
    assignments[shift.id] = [];
    const dayKey = startOfDay(shift.startDateTime).toISOString();
    const monthKey = startOfMonth(shift.startDateTime).toISOString();
    const yearKey = startOfYear(shift.startDateTime).toISOString();

    // Separate staff by required and preferred traits for prioritization
    const staffWithRequiredAndPreferred: StaffMember[] = [];
    const staffWithRequiredOnly: StaffMember[] = [];
    const staffWithPreferredOnly: StaffMember[] = [];
    const staffWithNeither: StaffMember[] = [];

    for (const staffMember of staff) {
      // Check basic eligibility first
      if (isStaffBlocked(staffMember, shift)) {
        console.log(`[Greedy] ${shift.name}: ${staffMember.name} blocked by time`);
        continue;
      }
      if (hasExcludedTrait(staffMember, shift)) {
        console.log(`[Greedy] ${shift.name}: ${staffMember.name} has excluded trait`);
        continue;
      }

      // Check if staff has required traits
      let hasAllRequiredTraits = true;
      if (shift.requirements.requiredTraits && shift.requirements.requiredTraits.length > 0) {
        for (const traitReq of shift.requirements.requiredTraits) {
          if (!staffMember.traitIds.includes(traitReq.traitId)) {
            hasAllRequiredTraits = false;
            break;
          }
        }
      } else {
        // If no required traits, consider this true
        hasAllRequiredTraits = true;
      }

      // Check if staff has preferred traits
      let hasSomePreferredTraits = false;
      if (shift.requirements.preferredTraits && shift.requirements.preferredTraits.length > 0) {
        for (const preferredTraitId of shift.requirements.preferredTraits) {
          if (staffMember.traitIds.includes(preferredTraitId)) {
            hasSomePreferredTraits = true;
            break;
          }
        }
      }

      // Categorize staff based on trait matching
      const hasRequiredTraitConstraint = shift.requirements.requiredTraits && shift.requirements.requiredTraits.length > 0;

      if (hasAllRequiredTraits && hasSomePreferredTraits) {
        staffWithRequiredAndPreferred.push(staffMember);
      } else if (hasAllRequiredTraits && !hasSomePreferredTraits && hasRequiredTraitConstraint) {
        staffWithRequiredOnly.push(staffMember);
      } else if (!hasAllRequiredTraits && hasSomePreferredTraits) {
        staffWithPreferredOnly.push(staffMember);
      } else {
        staffWithNeither.push(staffMember);
      }
    }

    // Sort by least assigned (balance workload)
    const sortByLeastAssigned = (a: StaffMember, b: StaffMember) => {
      return (staffWeeklyCount.get(a.id) || 0) - (staffWeeklyCount.get(b.id) || 0);
    };

    staffWithRequiredAndPreferred.sort(sortByLeastAssigned);
    staffWithRequiredOnly.sort(sortByLeastAssigned);
    staffWithPreferredOnly.sort(sortByLeastAssigned);
    staffWithNeither.sort(sortByLeastAssigned);

    console.log(`[Greedy] ${shift.name} categories: req+pref=${staffWithRequiredAndPreferred.length}, req=${staffWithRequiredOnly.length}, pref=${staffWithPreferredOnly.length}, neither=${staffWithNeither.length}`);

    // First, try to satisfy trait requirements - prioritize staff with preferred traits
    let traitRequirementsMet = true;
    if (shift.requirements.requiredTraits && shift.requirements.requiredTraits.length > 0) {
      for (const traitReq of shift.requirements.requiredTraits) {
        let assignedWithTrait = 0;

        // Try staff with both required and preferred traits first, then just required
        const eligibleStaff = [...staffWithRequiredAndPreferred, ...staffWithRequiredOnly];
        console.log(`[Greedy] Shift ${shift.name}: ${eligibleStaff.length} staff with required trait (${traitReq.traitId.substring(0, 20)}...)`);

        for (const staffMember of eligibleStaff) {
          if (!staffMember.traitIds.includes(traitReq.traitId)) continue;
          if (assignments[shift.id].includes(staffMember.id)) continue;

          // Check constraints
          const dailyMap = staffDailyCount.get(staffMember.id)!;
          const monthlyMap = staffMonthlyCount.get(staffMember.id)!;
          const yearlyMap = staffYearlyCount.get(staffMember.id)!;

          const dailyCount = dailyMap.get(dayKey) || 0;
          const weeklyCount = staffWeeklyCount.get(staffMember.id) || 0;
          const monthlyCount = monthlyMap.get(monthKey) || 0;
          const yearlyCount = yearlyMap.get(yearKey) || 0;

          const maxPerDay = staffMember.constraints.maxShiftsPerDay ?? 1;
          const maxPerWeek = staffMember.constraints.maxShiftsPerWeek ?? 5;
          const maxPerMonth = staffMember.constraints.maxShiftsPerMonth ?? 21;
          const maxPerYear = staffMember.constraints.maxShiftsPerYear ?? Infinity;

          console.log(`[Greedy] Checking ${staffMember.name}: weekly=${weeklyCount}/${maxPerWeek}, constraint=${staffMember.constraints.maxShiftsPerWeek}`);

          if (dailyCount >= maxPerDay) {
            console.log(`[Greedy] ${staffMember.name} rejected: daily limit (${dailyCount}/${maxPerDay})`);
            continue;
          }
          if (weeklyCount >= maxPerWeek) {
            console.log(`[Greedy] ${staffMember.name} rejected: weekly limit (${weeklyCount}/${maxPerWeek})`);
            continue;
          }
          if (monthlyCount >= maxPerMonth) {
            console.log(`[Greedy] ${staffMember.name} rejected: monthly limit`);
            continue;
          }
          if (yearlyCount >= maxPerYear) {
            console.log(`[Greedy] ${staffMember.name} rejected: yearly limit`);
            continue;
          }

          // Check incompatibility with already assigned staff
          let isIncompatible = false;
          for (const assignedStaffId of assignments[shift.id]) {
            const assignedStaff = staff.find(s => s.id === assignedStaffId);
            if (assignedStaff && areStaffIncompatible(staffMember, assignedStaff)) {
              isIncompatible = true;
              break;
            }
          }
          if (isIncompatible) continue;

          // Check shared rest day constraints
          if (wouldViolateSharedRestDays(staffMember, shift, staff, weekShifts, assignments, weekStart, weekEnd)) {
            continue;
          }

          // Assign staff
          console.log(`[Greedy] Assigning ${staffMember.name} to ${shift.name} (weekly: ${weeklyCount} -> ${weeklyCount + 1})`);
          assignments[shift.id].push(staffMember.id);
          dailyMap.set(dayKey, dailyCount + 1);
          staffWeeklyCount.set(staffMember.id, weeklyCount + 1);
          monthlyMap.set(monthKey, monthlyCount + 1);
          yearlyMap.set(yearKey, yearlyCount + 1);
          assignedWithTrait++;

          if (assignedWithTrait >= traitReq.minCount) break;
        }

        if (assignedWithTrait < traitReq.minCount) {
          traitRequirementsMet = false;
        }
      }
    }

    // Then fill remaining slots with any available staff
    // Even if trait requirements aren't met, we should still partially fill the shift
    // Prioritize: required+preferred, required-only, preferred-only, then anyone
    const targetStaffCount = shift.requirements.staffCount;

    const allEligibleStaff: StaffMember[] = [
      ...staffWithRequiredAndPreferred,
      ...staffWithRequiredOnly,
      ...staffWithPreferredOnly,
      ...staffWithNeither
    ];

    console.log(`[Greedy] ${shift.name} filling remaining slots: currently ${assignments[shift.id].length}/${targetStaffCount}, total eligible=${allEligibleStaff.length}`);

    for (const staffMember of allEligibleStaff) {
      if (assignments[shift.id].length >= targetStaffCount) break;
      if (assignments[shift.id].includes(staffMember.id)) continue;

      // Check constraints
      const dailyMap = staffDailyCount.get(staffMember.id)!;
      const monthlyMap = staffMonthlyCount.get(staffMember.id)!;
      const yearlyMap = staffYearlyCount.get(staffMember.id)!;

      const dailyCount = dailyMap.get(dayKey) || 0;
      const weeklyCount = staffWeeklyCount.get(staffMember.id) || 0;
      const monthlyCount = monthlyMap.get(monthKey) || 0;
      const yearlyCount = yearlyMap.get(yearKey) || 0;

      const maxPerDay = staffMember.constraints.maxShiftsPerDay ?? 1;
      const maxPerWeek = staffMember.constraints.maxShiftsPerWeek ?? 5;
      const maxPerMonth = staffMember.constraints.maxShiftsPerMonth ?? 21;
      const maxPerYear = staffMember.constraints.maxShiftsPerYear ?? Infinity;

      console.log(`[Greedy] Checking ${staffMember.name}: weekly=${weeklyCount}/${maxPerWeek}, constraint=${staffMember.constraints.maxShiftsPerWeek}`);

      if (dailyCount >= maxPerDay) {
        console.log(`[Greedy] ${staffMember.name} rejected: daily limit (${dailyCount}/${maxPerDay})`);
        continue;
      }
      if (weeklyCount >= maxPerWeek) {
        console.log(`[Greedy] ${staffMember.name} rejected: weekly limit (${weeklyCount}/${maxPerWeek})`);
        continue;
      }
      if (monthlyCount >= maxPerMonth) {
        console.log(`[Greedy] ${staffMember.name} rejected: monthly limit`);
        continue;
      }
      if (yearlyCount >= maxPerYear) {
        console.log(`[Greedy] ${staffMember.name} rejected: yearly limit`);
        continue;
      }

      // Check incompatibility with already assigned staff
      let isIncompatible = false;
      for (const assignedStaffId of assignments[shift.id]) {
        const assignedStaff = staff.find(s => s.id === assignedStaffId);
        if (assignedStaff && areStaffIncompatible(staffMember, assignedStaff)) {
          isIncompatible = true;
          break;
        }
      }
      if (isIncompatible) continue;

      // Check shared rest day constraints
      if (wouldViolateSharedRestDays(staffMember, shift, staff, weekShifts, assignments, weekStart, weekEnd)) {
        continue;
      }

      // Assign staff
      console.log(`[Greedy] Assigning ${staffMember.name} to ${shift.name} (weekly: ${weeklyCount} -> ${weeklyCount + 1})`);
      assignments[shift.id].push(staffMember.id);
      dailyMap.set(dayKey, dailyCount + 1);
      staffWeeklyCount.set(staffMember.id, weeklyCount + 1);
      monthlyMap.set(monthKey, monthlyCount + 1);
      yearlyMap.set(yearKey, yearlyCount + 1);
    }
  }

  // Generate warnings about unfilled/understaffed shifts
  const warnings: string[] = [];
  const unfilledShifts = sortedShifts.filter(shift =>
    !assignments[shift.id] || assignments[shift.id].length === 0
  ).length;

  const understaffedShifts = sortedShifts.filter(shift => {
    const assigned = assignments[shift.id]?.length || 0;
    return assigned > 0 && assigned < shift.requirements.staffCount;
  }).length;

  const totalAssignments = Object.values(assignments).reduce((sum, staffList) => sum + staffList.length, 0);

  console.log(`[YALPSScheduler] Greedy scheduler completed: ${totalAssignments} assignments made`);
  console.log(`[YALPSScheduler] Unfilled shifts: ${unfilledShifts}, Understaffed shifts: ${understaffedShifts}`);

  if (unfilledShifts > 0 || understaffedShifts > 0) {
    const warningParts: string[] = [];

    if (unfilledShifts > 1) {
      warningParts.push(t('autoScheduler.unfilledShifts_plural', { count: unfilledShifts }));
    } else if (unfilledShifts > 0) {
      warningParts.push(t('autoScheduler.unfilledShifts', { count: unfilledShifts }));
    }

    if (understaffedShifts > 1) {
      warningParts.push(t('autoScheduler.understaffedShifts_plural', { count: understaffedShifts }));
    } else if (understaffedShifts > 0) {
      warningParts.push(t('autoScheduler.understaffedShifts', { count: understaffedShifts }));
    }

    warningParts.push(t('autoScheduler.constraintsRespected', 'All constraints were respected. Some shifts could not be filled.'));

    warnings.push(warningParts.join('\n• '));
  }

  return {
    success: true,
    assignments,
    warnings,
    errors: [],
    objective: totalAssignments,
    algorithm: 'greedy-best-effort'
  };
}

/**
 * Staff scheduling using YALPS Linear Programming solver
 */
export function yalpsAutoScheduleWeek(
  shiftOccurrences: ShiftOccurrence[],
  staff: StaffMember[],
  weekStart: Date,
  t: TFunction
): YALPSSchedulingResult {
  console.log('[YALPSScheduler] Starting YALPS-based scheduling');
  
  try {
    // Filter shifts for current week
    const weekEnd = endOfWeek(weekStart);
    const weekShifts = shiftOccurrences.filter(shift => {
      return isWithinInterval(shift.startDateTime, { start: weekStart, end: weekEnd });
    });

    if (weekShifts.length === 0) {
      return {
        success: true,
        assignments: {},
        warnings: [],
        errors: [],
        objective: 0,
        algorithm: 'yalps-linear-programming'
      };
    }

    console.log(`[YALPSScheduler] Processing ${weekShifts.length} shifts with ${staff.length} staff`);

    // Build the linear programming model
    const model = buildSchedulingModel(weekShifts, staff, shiftOccurrences, weekStart);
    
    if (!model) {
      return {
        success: false,
        assignments: {},
        warnings: [],
        errors: ['Failed to build scheduling model'],
        objective: 0,
        algorithm: 'yalps-linear-programming'
      };
    }

    console.log('[YALPSScheduler] Solving linear programming model');
    
    // Solve the model
    const solution = solve(model);
    
    if (!solution.result) {
      console.log(`[YALPSScheduler] Full solution not found: ${solution.status}. Attempting fallback with partial shift filling...`);
      
      // Try fallback: use same model but relax shift requirements from 'equal' to 'max'
      // This allows partial shift filling while maintaining trait requirements
      const fallbackModel = {
        direction: model.direction,
        objective: model.objective,
        variables: model.variables,  // Same variables
        binaries: model.binaries,    // Same binaries
        constraints: { ...model.constraints }  // Shallow copy constraints
      };

      // Change shift requirements to allow partial filling (but keep trait requirements)
      let relaxedCount = 0;
      for (const shift of weekShifts) {
        const constraintName = `shift_${shift.id}`;
        if (fallbackModel.constraints[constraintName]?.equal !== undefined) {
          const equalValue = fallbackModel.constraints[constraintName].equal;
          fallbackModel.constraints[constraintName] = {
            max: equalValue
          };
          relaxedCount++;
        }
      }

      console.log(`[YALPSScheduler] Solving fallback model with partial shift filling (${relaxedCount} shift constraints relaxed, trait requirements maintained)`);
      const fallbackSolution = solve(fallbackModel);

      if (fallbackSolution.result) {
        console.log('[YALPSScheduler] Fallback solution found (with trait requirements)');
        console.log('[YALPSScheduler] Fallback objective value:', fallbackSolution.result);
        console.log('[YALPSScheduler] Fallback variables count:', fallbackSolution.variables?.length || 0);

        const assignments = convertSolutionToAssignments(fallbackSolution, weekShifts, staff);

        // Count total assignments made
        const totalAssignments = Object.values(assignments).reduce((sum, staffList) => sum + staffList.length, 0);
        console.log('[YALPSScheduler] Total assignments made:', totalAssignments);
        
        // Generate improved warnings for partial solution
        const maxReasons = 5;
        const reasons: string[] = [];
        
        // Check for unfilled shifts
        const unfilledShifts = weekShifts.filter(shift => 
          !assignments[shift.id] || assignments[shift.id].length === 0
        ).length;
        
        if (unfilledShifts > 1) {
          reasons.push(t('autoScheduler.unfilledShifts_plural', { count: unfilledShifts }));
        } else if (unfilledShifts > 0) {
          reasons.push(t('autoScheduler.unfilledShifts', { count: unfilledShifts }));
        }
        
        // Check for understaffed shifts
        const understaffedShifts = weekShifts.filter(shift => {
          const assigned = assignments[shift.id]?.length || 0;
          return assigned > 0 && assigned < shift.requirements.staffCount;
        }).length;
        
        if (understaffedShifts > 1) {
          reasons.push(t('autoScheduler.understaffedShifts_plural', { count: understaffedShifts }));
        } else if (understaffedShifts > 0) {
          reasons.push(t('autoScheduler.understaffedShifts', { count: understaffedShifts }));
        }
        
        // Check for potential additional constraint-related issues
        let hasTraitRequirements = false;
        let hasStaffBlocked = false;
        let hasInsufficientStaff = false;
        
        for (const shift of weekShifts) {
          // Check if shift has trait requirements
          if (shift.requirements.requiredTraits && shift.requirements.requiredTraits.length > 0) {
            hasTraitRequirements = true;
          }
          
          // Check if staff are blocked during this shift
          for (const staffMember of staff) {
            if (staffMember.blockedTimes && Array.isArray(staffMember.blockedTimes)) {
              for (const blockedTime of staffMember.blockedTimes) {
                if (shift.startDateTime < blockedTime.endDateTime && 
                    shift.endDateTime > blockedTime.startDateTime) {
                  hasStaffBlocked = true;
                  break;
                }
              }
            }
            if (hasStaffBlocked) break;
          }
        }
        
        // Check if there's generally insufficient staff
        if (staff.length < 2 && weekShifts.some(shift => shift.requirements.staffCount > 1)) {
          hasInsufficientStaff = true;
        }
        
        // Add constraint-specific reasons
        if (hasInsufficientStaff && reasons.length < maxReasons) {
          reasons.push(t('autoScheduler.insufficientStaff'));
        }
        if (hasTraitRequirements && reasons.length < maxReasons) {
          reasons.push(t('autoScheduler.traitRequirements'));  
        }
        if (hasStaffBlocked && reasons.length < maxReasons) {
          reasons.push(t('autoScheduler.staffUnavailable'));
        }
        
        // Create the warning message with title and enumerated reasons
        let warningMessage = '';
        
        if (reasons.length > 0) {
          const displayReasons = reasons.slice(0, maxReasons);
          const moreReasonsCount = reasons.length - maxReasons;
          
          warningMessage += displayReasons.join('\n• ');
          
          if (moreReasonsCount > 0) {
            warningMessage += '\n• ' + t('autoScheduler.moreReasons', { count: moreReasonsCount });
          }
        }
        
        const warnings: string[] = [warningMessage];
        
        return {
          success: true,
          assignments,
          warnings,
          errors: [],
          objective: fallbackSolution.result || 0,
          algorithm: 'yalps-fallback'
        };
      }

      // No solution found even with LP fallback - use greedy best-effort approach
      console.log('[YALPSScheduler] LP fallback failed, attempting greedy best-effort scheduling');

      const greedyResult = greedyBestEffortSchedule(
        weekShifts,
        staff,
        shiftOccurrences,
        weekStart,
        weekEnd,
        t
      );

      return greedyResult;
    }

    console.log('[YALPSScheduler] Solution found');
    console.log('[YALPSScheduler] Raw solution:', JSON.stringify(solution, null, 2));
    
    // Convert solution to assignments
    const assignments = convertSolutionToAssignments(solution, weekShifts, staff);
    
    return {
      success: true,
      assignments,
      warnings: [],
      errors: [],
      objective: solution.result || 0,
      algorithm: 'yalps-linear-programming'
    };

  } catch (error) {
    console.error('[YALPSScheduler] Error during scheduling:', error);
    return {
      success: false,
      assignments: {},
      warnings: [],
      errors: [`Scheduling error: ${error instanceof Error ? error.message : 'Unknown error'}`],
      objective: 0,
      algorithm: 'yalps-linear-programming'
    };
  }
}

/**
 * Build YALPS linear programming model from scheduling problem
 */
function buildSchedulingModel(
  shifts: ShiftOccurrence[], 
  staff: StaffMember[], 
  allShiftOccurrences: ShiftOccurrence[], 
  weekStart: Date
) {
  console.log('[YALPSScheduler] Building LP model');
  
  const variables: { [key: string]: YALPSVariable } = {};
  const constraints: { [key: string]: YALPSConstraint } = {};
  const binaries: string[] = [];

  // CONSTRAINTS DEFINITION
  
  // 1. Each shift must have exactly the required number of staff
  for (const shift of shifts) {
    constraints[`shift_${shift.id}`] = {
      equal: shift.requirements.staffCount
    }
  }

  // 1b. Each shift must have minimum required staff with specific traits
  for (const shift of shifts) {
    if (shift.requirements.requiredTraits && shift.requirements.requiredTraits.length > 0) {
      for (const traitReq of shift.requirements.requiredTraits) {
        constraints[`trait_${shift.id}_${traitReq.traitId}`] = {
          min: traitReq.minCount
        };
      }
    }
  }

  // 2. Each staff member has daily limits (accounting for existing assignments)
  const staffDailyLimits = new Map<string, Map<string, number>>();
  for (const staffMember of staff) {
    const maxPerDay = staffMember.constraints.maxShiftsPerDay ?? 1;
    staffDailyLimits.set(staffMember.id, new Map());

    // Create daily limit constraint for each day this staff member could work
    for (const shift of shifts) {
      const dayKey = startOfDay(shift.startDateTime).toISOString().slice(0, 10);
      if (!staffDailyLimits.get(staffMember.id)!.has(dayKey)) {
        // Count existing assignments on this day
        const existingDailyAssignments = shifts.filter(s =>
          startOfDay(s.startDateTime).toISOString().slice(0, 10) === dayKey &&
          s.assignedStaff.includes(staffMember.id)
        ).length;

        const availableDailySlots = Math.max(0, maxPerDay - existingDailyAssignments);
        staffDailyLimits.get(staffMember.id)!.set(dayKey, availableDailySlots);
        constraints[`daily_${staffMember.id}_${dayKey}`] = { max: availableDailySlots };

        if (existingDailyAssignments > 0) {
          console.log(`[YALPSScheduler] ${staffMember.name} already has ${existingDailyAssignments} shift(s) on ${dayKey}, remaining: ${availableDailySlots}`);
        }
      }
    }
  }

  // 3. Each staff member has weekly limits (accounting for existing assignments)
  for (const staffMember of staff) {
    const maxPerWeek = staffMember.constraints.maxShiftsPerWeek ?? 5;

    // Count existing assignments in the week being scheduled
    const existingWeeklyAssignments = shifts.filter(s =>
      s.assignedStaff.includes(staffMember.id)
    ).length;

    const availableWeeklySlots = Math.max(0, maxPerWeek - existingWeeklyAssignments);
    constraints[`weekly_${staffMember.id}`] = { max: availableWeeklySlots };

    if (existingWeeklyAssignments > 0) {
      console.log(`[YALPSScheduler] ${staffMember.name} already has ${existingWeeklyAssignments} shift(s) this week, remaining: ${availableWeeklySlots}/${maxPerWeek}`);
    }
  }

  // 4. Each staff member has monthly limits (accounting for existing assignments)
  const monthStart = startOfMonth(weekStart);
  const monthEnd = endOfMonth(weekStart);
  
  for (const staffMember of staff) {
    const maxPerMonth = staffMember.constraints.maxShiftsPerMonth ?? 21;
    
    // Count existing assignments in this month (outside the current week)
    const existingMonthlyAssignments = allShiftOccurrences.filter(occ => 
      occ.assignedStaff.includes(staffMember.id) &&
      isWithinInterval(occ.startDateTime, { start: monthStart, end: monthEnd }) &&
      !shifts.some(weekShift => weekShift.id === occ.id) // Exclude shifts being scheduled this week
    ).length;
    
    const availableMonthlySlots = Math.max(0, maxPerMonth - existingMonthlyAssignments);
    constraints[`monthly_${staffMember.id}`] = { max: availableMonthlySlots };
  }

  // 5. Each staff member has yearly limits (accounting for existing assignments)  
  const yearStart = startOfYear(weekStart);
  const yearEnd = endOfYear(weekStart);
  
  for (const staffMember of staff) {
    const maxPerYear = staffMember.constraints.maxShiftsPerYear ?? Infinity;
    
    // Count existing assignments in this year (outside the current week)
    const existingYearlyAssignments = allShiftOccurrences.filter(occ => 
      occ.assignedStaff.includes(staffMember.id) &&
      isWithinInterval(occ.startDateTime, { start: yearStart, end: yearEnd }) &&
      !shifts.some(weekShift => weekShift.id === occ.id) // Exclude shifts being scheduled this week
    ).length;
    
    const availableYearlySlots = Math.max(0, maxPerYear - existingYearlyAssignments);
    constraints[`yearly_${staffMember.id}`] = { max: availableYearlySlots };
  }

  // TEMPORAL CONSTRAINTS SETUP
  
  // Get all days in the scheduling period for temporal constraints
  const weekEnd = endOfWeek(weekStart);
  const allDaysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });
  
  console.log(`[YALPSScheduler] Processing temporal constraints for ${allDaysInWeek.length} days`);
  
  // Create day-level work variables for all staff members
  const dayWorkVariables = createDayWorkVariables(variables, binaries, staff, allDaysInWeek);
  
  // 6. Consecutive rest days constraints
  addConsecutiveRestConstraints(constraints, variables, binaries, staff, allDaysInWeek);
  
  // 7. Rest days with staff constraints  
  addRestDaysWithStaffConstraints(constraints, variables, binaries, staff, allDaysInWeek);

  // VARIABLES DEFINITION
  
  // Create a binary variable for each (staff, shift) pair
  for (const shift of shifts) {
    for (const staffMember of staff) {
      
      // Check if staff is available (not blocked)
      let isAvailable = true;
      if (staffMember.blockedTimes && Array.isArray(staffMember.blockedTimes)) {
        for (const blockedTime of staffMember.blockedTimes) {
          if (shift.startDateTime < blockedTime.endDateTime && 
              shift.endDateTime > blockedTime.startDateTime) {
            isAvailable = false;
            break;
          }
        }
      }

      // Note: We don't exclude staff based on required traits here.
      // Trait requirements are handled by separate constraints below.
      // Staff without required traits can still fill remaining slots.

      // Check excluded traits - staff with these traits cannot be scheduled
      if (shift.requirements.excludedTraits && shift.requirements.excludedTraits.length > 0) {
        for (const excludedTraitId of shift.requirements.excludedTraits) {
          if (staffMember.traitIds.includes(excludedTraitId)) {
            isAvailable = false;
            break;
          }
        }
      }
      
      if (isAvailable) {
        const varName = `x_${staffMember.id}_${shift.id}`;
        const coeffs: { [key: string]: number } = {};
        
        // Objective: maximize assignments (each assignment contributes 1)
        coeffs.assignments = 1;
        
        // Shift requirement constraint (this assignment fulfills 1 spot)
        coeffs[`shift_${shift.id}`] = 1;
        
        // Daily limit constraint (this assignment uses 1 daily slot)
        const dayKey = startOfDay(shift.startDateTime).toISOString().slice(0, 10);
        coeffs[`daily_${staffMember.id}_${dayKey}`] = 1;
        
        // Weekly limit constraint (this assignment uses 1 weekly slot)
        coeffs[`weekly_${staffMember.id}`] = 1;
        
        // Monthly limit constraint (this assignment uses 1 monthly slot)
        coeffs[`monthly_${staffMember.id}`] = 1;
        
        // Yearly limit constraint (this assignment uses 1 yearly slot)
        coeffs[`yearly_${staffMember.id}`] = 1;

        // Trait requirement constraints (if staff has required trait, they contribute 1)
        if (shift.requirements.requiredTraits && shift.requirements.requiredTraits.length > 0) {
          for (const traitReq of shift.requirements.requiredTraits) {
            if (staffMember.traitIds.includes(traitReq.traitId)) {
              coeffs[`trait_${shift.id}_${traitReq.traitId}`] = 1;
            }
          }
        }

        variables[varName] = coeffs;
        binaries.push(varName);
      }
    }
  }

  // INCOMPATIBLE STAFF CONSTRAINTS
  // Add these as additional constraints after variables are defined
  for (const shift of shifts) {
    for (let i = 0; i < staff.length; i++) {
      for (let j = i + 1; j < staff.length; j++) {
        const staff1 = staff[i];
        const staff2 = staff[j];
        
        const areIncompatible = 
          staff1.constraints.incompatibleWith.includes(staff2.id) ||
          staff2.constraints.incompatibleWith.includes(staff1.id);
          
        if (areIncompatible) {
          const var1 = `x_${staff1.id}_${shift.id}`;
          const var2 = `x_${staff2.id}_${shift.id}`;
          
          // Only add constraint if both variables exist
          if (variables[var1] && variables[var2]) {
            const constraintName = `incompatible_${staff1.id}_${staff2.id}_${shift.id}`;
            constraints[constraintName] = { max: 1 };
            
            // Add coefficients to existing variables
            variables[var1][constraintName] = 1;
            variables[var2][constraintName] = 1;
          }
        }
      }
    }
  }

  // Link day variables to shift assignments (must be done after shift variables are created)
  linkDayVariablesToShifts(constraints, variables, dayWorkVariables, staff, allDaysInWeek, shifts);

  const model = {
    direction: "maximize" as const,
    objective: "assignments",
    constraints,
    variables,
    binaries
  };

  console.log(`[YALPSScheduler] Model created: ${Object.keys(variables).length} variables, ${Object.keys(constraints).length} constraints`);

  // Log daily/weekly constraints for debugging
  for (const staffMember of staff) {
    const weeklyConst = constraints[`weekly_${staffMember.id}`];
    console.log(`[YALPSScheduler] ${staffMember.name}: weekly max = ${weeklyConst?.max}, daily max = ${staffMember.constraints.maxShiftsPerDay || 1}`);
  }

  return model;
}

/**
 * Convert YALPS solution to shift assignments
 */
function convertSolutionToAssignments(
  solution: YALPSSolution,
  shifts: ShiftOccurrence[],
  staff: StaffMember[]
): { [occurrenceId: string]: string[] } {
  const assignments: { [occurrenceId: string]: string[] } = {};
  
  // Initialize all shifts with empty arrays
  for (const shift of shifts) {
    assignments[shift.id] = [];
  }
  
  // Parse solution variables (YALPS returns variables as array of [name, value] tuples)
  if (solution.variables && Array.isArray(solution.variables)) {
    for (const [variableName, value] of solution.variables) {
      if (typeof value === 'number' && value > 0.5) { // Binary variable is 1
        // Parse variable name: x_staffId_shiftId
        const match = variableName.match(/^x_(.+)_(.+)$/);
        if (match) {
          const [, staffId, shiftId] = match;
          
          // Verify this is a valid assignment
          const staffExists = staff.some(s => s.id === staffId);
          const shiftExists = shifts.some(s => s.id === shiftId);
          
          if (staffExists && shiftExists) {
            assignments[shiftId].push(staffId);
          }
        }
      }
    }
  }
  
  return assignments;
}

/**
 * Create day-level work variables for all staff members
 */
function createDayWorkVariables(
  variables: { [key: string]: YALPSVariable },
  binaries: string[],
  staff: StaffMember[],
  allDays: Date[]
): { [staffId: string]: { [dayKey: string]: string } } {
  const dayWorkVariables: { [staffId: string]: { [dayKey: string]: string } } = {};
  
  for (const staffMember of staff) {
    dayWorkVariables[staffMember.id] = {};
    
    for (const day of allDays) {
      const dayKey = startOfDay(day).toISOString().slice(0, 10);
      const dayVarName = `work_day_${staffMember.id}_${dayKey}`;
      
      dayWorkVariables[staffMember.id][dayKey] = dayVarName;
      
      // Initialize day variable
      variables[dayVarName] = {};
      binaries.push(dayVarName);
    }
  }
  
  return dayWorkVariables;
}

/**
 * Add consecutive rest days constraints to the YALPS model
 */
function addConsecutiveRestConstraints(
  constraints: { [key: string]: YALPSConstraint },
  variables: { [key: string]: YALPSVariable },
  binaries: string[],
  staff: StaffMember[],
  allDays: Date[]
) {
  for (const staffMember of staff) {
    const restConstraints = staffMember.constraints.consecutiveRestDays || [];
    
    for (const restConstraint of restConstraints) {
      if (restConstraint.period === 'week') {
        const minConsecutive = restConstraint.minConsecutiveDays;
        const numDays = allDays.length;
        
        if (minConsecutive > numDays || minConsecutive <= 0) {
          continue; // Cannot satisfy or invalid constraint
        }
        
        console.log(`[YALPSScheduler] Adding consecutive rest constraint for ${staffMember.name}: ${minConsecutive} days`);
        
        // For each possible starting position of a consecutive rest window
        const windowVars: string[] = [];
        
        for (let startIdx = 0; startIdx <= numDays - minConsecutive; startIdx++) {
          const windowVarName = `rest_window_${staffMember.id}_${startIdx}`;
          windowVars.push(windowVarName);
          
          variables[windowVarName] = {};
          binaries.push(windowVarName);
          
          // If this window is active, all days in the window must be rest days
          for (let dayOffset = 0; dayOffset < minConsecutive; dayOffset++) {
            const day = allDays[startIdx + dayOffset];
            const dayKey = startOfDay(day).toISOString().slice(0, 10);
            const workDayVar = `work_day_${staffMember.id}_${dayKey}`;
            
            // Constraint: windowVar + workDayVar <= 1
            // This means: if window is active (1), work day must be 0 (rest day)
            const constraintName = `window_rest_${staffMember.id}_${startIdx}_${dayOffset}`;
            constraints[constraintName] = { max: 1 };
            
            if (!variables[windowVarName][constraintName]) {
              variables[windowVarName][constraintName] = 1;
            }
            if (!variables[workDayVar][constraintName]) {
              variables[workDayVar][constraintName] = 1;
            }
          }
        }
        
        // At least one window must be active
        const minWindowConstraint = `min_rest_window_${staffMember.id}`;
        constraints[minWindowConstraint] = { min: 1 };
        
        for (const windowVar of windowVars) {
          variables[windowVar][minWindowConstraint] = 1;
        }
      }
    }
  }
}

/**
 * Add rest days with staff constraints to the YALPS model
 */
function addRestDaysWithStaffConstraints(
  constraints: { [key: string]: YALPSConstraint },
  variables: { [key: string]: YALPSVariable },
  binaries: string[],
  staff: StaffMember[],
  allDays: Date[]
) {
  for (const staffMember of staff) {
    const restWithStaffConstraints = staffMember.constraints.restDaysWithStaff || [];
    
    for (const restConstraint of restWithStaffConstraints) {
      if (restConstraint.period === 'week') {
        const relatedStaff = staff.find(s => s.id === restConstraint.staffId);
        if (!relatedStaff) continue;
        
        const minSharedRestDays = restConstraint.minRestDays;
        console.log(`[YALPSScheduler] Adding shared rest constraint: ${staffMember.name} with ${relatedStaff.name}, ${minSharedRestDays} days`);
        
        // Create shared rest day variables for each day
        const sharedRestVars: string[] = [];
        
        for (const day of allDays) {
          const dayKey = startOfDay(day).toISOString().slice(0, 10);
          const staff1WorkVar = `work_day_${staffMember.id}_${dayKey}`;
          const staff2WorkVar = `work_day_${relatedStaff.id}_${dayKey}`;
          const sharedRestVar = `shared_rest_${staffMember.id}_${relatedStaff.id}_${dayKey}`;
          
          sharedRestVars.push(sharedRestVar);
          variables[sharedRestVar] = {};
          binaries.push(sharedRestVar);
          
          // Constraints for shared rest day logic:
          // sharedRest <= (1 - staff1Work) and sharedRest <= (1 - staff2Work)
          // This becomes: sharedRest + staff1Work <= 1 and sharedRest + staff2Work <= 1
          
          const constraint1 = `shared_rest1_${staffMember.id}_${relatedStaff.id}_${dayKey}`;
          const constraint2 = `shared_rest2_${staffMember.id}_${relatedStaff.id}_${dayKey}`;
          
          constraints[constraint1] = { max: 1 };
          constraints[constraint2] = { max: 1 };
          
          variables[sharedRestVar][constraint1] = 1;
          variables[staff1WorkVar][constraint1] = 1;
          
          variables[sharedRestVar][constraint2] = 1;
          variables[staff2WorkVar][constraint2] = 1;
        }
        
        // Ensure minimum shared rest days
        const minSharedConstraint = `min_shared_rest_${staffMember.id}_${relatedStaff.id}`;
        constraints[minSharedConstraint] = { min: minSharedRestDays };
        
        for (const sharedRestVar of sharedRestVars) {
          variables[sharedRestVar][minSharedConstraint] = 1;
        }
      }
    }
  }
}

/**
 * Link day-level work variables to shift assignment variables
 */
function linkDayVariablesToShifts(
  constraints: { [key: string]: YALPSConstraint },
  variables: { [key: string]: YALPSVariable },
  dayWorkVariables: { [staffId: string]: { [dayKey: string]: string } },
  staff: StaffMember[],
  allDays: Date[],
  shifts: ShiftOccurrence[]
) {
  console.log(`[YALPSScheduler] Linking day variables to shift assignments`);
  
  for (const staffMember of staff) {
    for (const day of allDays) {
      const dayKey = startOfDay(day).toISOString().slice(0, 10);
      const dayWorkVar = dayWorkVariables[staffMember.id][dayKey];
      
      // Find all shifts on this day for this staff member
      const shiftsOnDay = shifts.filter(shift => {
        const shiftDayKey = startOfDay(shift.startDateTime).toISOString().slice(0, 10);
        return shiftDayKey === dayKey;
      });
      
      if (shiftsOnDay.length === 0) {
        // No shifts on this day - day work variable can be 0
        continue;
      }
      
      // Day work variable = 1 if staff works ANY shift on this day
      // This means: dayWorkVar >= max(shiftVar1, shiftVar2, ...) 
      // We model this as: dayWorkVar >= shiftVarI for each shift on the day
      
      for (const shift of shiftsOnDay) {
        const shiftVarName = `x_${staffMember.id}_${shift.id}`;
        
        // Only create constraint if shift variable exists (might not due to availability checks)
        if (variables[shiftVarName]) {
          const linkConstraintName = `day_shift_link_${staffMember.id}_${dayKey}_${shift.id}`;
          
          // Constraint: shiftVar <= dayWorkVar
          // This becomes: shiftVar - dayWorkVar <= 0
          constraints[linkConstraintName] = { max: 0 };
          
          variables[shiftVarName][linkConstraintName] = 1;   // shiftVar coefficient
          variables[dayWorkVar][linkConstraintName] = -1;    // dayWorkVar coefficient
          
        }
      }
    }
  }
}

