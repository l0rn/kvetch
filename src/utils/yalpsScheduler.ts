import { solve } from 'yalps';
import { 
  endOfWeek, isWithinInterval, startOfDay, startOfMonth, startOfYear, endOfMonth, endOfYear, eachDayOfInterval
} from 'date-fns';
import type { ShiftOccurrence, StaffMember } from '../storage/database-pouchdb';
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
  algorithm: 'yalps-linear-programming' | 'yalps-fallback';
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
      const fallbackModel = { ...model };
      
      // Only change shift requirements to allow partial filling
      for (const shift of weekShifts) {
        const constraintName = `shift_${shift.id}`;
        if (fallbackModel.constraints[constraintName]?.equal !== undefined) {
          fallbackModel.constraints[constraintName] = { 
            max: fallbackModel.constraints[constraintName].equal 
          };
        }
      }
      
      console.log('[YALPSScheduler] Solving fallback model with partial shift filling');
      const fallbackSolution = solve(fallbackModel);
      
      if (fallbackSolution.result) {
        console.log('[YALPSScheduler] Fallback solution found');
        const assignments = convertSolutionToAssignments(fallbackSolution, weekShifts, staff);
        
        // Generate warnings for partial solution
        const warnings: string[] = [
          t('scheduling.partialSolutionWarning', 'Some shifts could not be fully staffed due to constraints. Filled what was possible.')
        ];
        
        // Check for unfilled/understaffed shifts
        const totalShifts = weekShifts.length;
        const unfilledShifts = weekShifts.filter(shift => 
          !assignments[shift.id] || assignments[shift.id].length === 0
        ).length;
        
        const understaffedShifts = weekShifts.filter(shift => {
          const assigned = assignments[shift.id]?.length || 0;
          return assigned > 0 && assigned < shift.requirements.staffCount;
        }).length;
        
        if (unfilledShifts > 0) {
          warnings.push(t('scheduling.unfilledShifts',
            `${unfilledShifts} out of ${totalShifts} shifts could not be filled`));
        }
        
        if (understaffedShifts > 0) {
          warnings.push(t('scheduling.understaffedShifts',
            `${understaffedShifts} shifts are understaffed but within constraint limits`));
        }
        
        return {
          success: true,
          assignments,
          warnings,
          errors: [],
          objective: fallbackSolution.result || 0,
          algorithm: 'yalps-fallback'
        };
      }
      
      return {
        success: false,
        assignments: {},
        warnings: [],
        errors: [`No solution found even with partial filling: ${fallbackSolution.status || 'Unknown error'}`],
        objective: 0,
        algorithm: 'yalps-linear-programming'
      };
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

  // 2. Each staff member has daily limits
  const staffDailyLimits = new Map<string, Map<string, number>>();
  for (const staffMember of staff) {
    const maxPerDay = staffMember.constraints.maxShiftsPerDay || 1;
    staffDailyLimits.set(staffMember.id, new Map());
    
    // Create daily limit constraint for each day this staff member could work
    for (const shift of shifts) {
      const dayKey = startOfDay(shift.startDateTime).toISOString().slice(0, 10);
      if (!staffDailyLimits.get(staffMember.id)!.has(dayKey)) {
        staffDailyLimits.get(staffMember.id)!.set(dayKey, maxPerDay);
        constraints[`daily_${staffMember.id}_${dayKey}`] = { max: maxPerDay };
      }
    }
  }

  // 3. Each staff member has weekly limits
  for (const staffMember of staff) {
    const maxPerWeek = staffMember.constraints.maxShiftsPerWeek || 5;
    constraints[`weekly_${staffMember.id}`] = { max: maxPerWeek };
  }

  // 4. Each staff member has monthly limits (accounting for existing assignments)
  const monthStart = startOfMonth(weekStart);
  const monthEnd = endOfMonth(weekStart);
  
  for (const staffMember of staff) {
    const maxPerMonth = staffMember.constraints.maxShiftsPerMonth || 21;
    
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
    const maxPerYear = staffMember.constraints.maxShiftsPerYear || 250;
    
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

      // Check trait requirements
      if (shift.requirements.requiredTraits && shift.requirements.requiredTraits.length > 0) {
        let hasRequiredTrait = false;
        for (const traitReq of shift.requirements.requiredTraits) {
          if (staffMember.traitIds.includes(traitReq.traitId)) {
            hasRequiredTrait = true;
            break;
          }
        }
        // If shift requires traits and staff doesn't have any, skip
        if (!hasRequiredTrait) {
          isAvailable = false;
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

