import { endOfWeek, isWithinInterval } from 'date-fns';
import type { ShiftOccurrence, StaffMember, Trait } from '../storage/database-pouchdb';
import type { TFunction } from 'i18next';
import { constraintEngine, type ConstraintContext } from './constraints';
import { formatLocalizedDateTime } from './datetime';

export interface AdvancedSchedulingResult {
  success: boolean;
  assignments: { [occurrenceId: string]: string[] };
  warnings: string[];
  errors: string[];
  iterations: number;
  backtrackCount: number;
}

interface SchedulingCandidate {
  staffId: string;
  shiftId: string;
  priority: number;
  hardConstraintViolations: number;
  softConstraintViolations: number;
}

interface SchedulingState {
  assignments: { [occurrenceId: string]: string[] };
  unfilledShifts: string[];
  constraintViolations: number;
}

/**
 * Advanced scheduling algorithm using constraint satisfaction with backtracking
 * Uses heuristics to find optimal solutions and can recover from local optima
 */
export class AdvancedScheduler {
  private staff: StaffMember[];
  private shifts: ShiftOccurrence[];
  private weekStart: Date;
  private t: TFunction;
  private language: string;
  private maxIterations: number = 1000;
  private maxBacktracks: number = 50;

  constructor(
    staff: StaffMember[],
    shifts: ShiftOccurrence[],
    _traits: Trait[],
    weekStart: Date,
    t: TFunction,
    language: string
  ) {
    this.staff = staff;
    this.shifts = shifts;
    this.weekStart = weekStart;
    this.t = t;
    this.language = language;
  }

  /**
   * Main scheduling function with constraint satisfaction and backtracking
   */
  schedule(): AdvancedSchedulingResult {
    const result: AdvancedSchedulingResult = {
      success: false,
      assignments: {},
      warnings: [],
      errors: [],
      iterations: 0,
      backtrackCount: 0
    };

    // Filter occurrences for the current week
    const weekEnd = endOfWeek(this.weekStart);
    const weekShifts = this.shifts.filter(shift => {
      return isWithinInterval(shift.startDateTime, { start: this.weekStart, end: weekEnd });
    });

    if (weekShifts.length === 0) {
      result.success = true;
      return result;
    }

    // Initialize assignments
    weekShifts.forEach(shift => {
      result.assignments[shift.id] = [];
    });

    // Sort shifts by difficulty (hardest to staff first)
    const sortedShifts = this.sortShiftsByDifficulty(weekShifts);

    // Try different scheduling approaches
    const approaches: Array<{name: string, fn: () => boolean}> = [
      { name: 'trait_first', fn: () => this.scheduleWithHeuristic(sortedShifts, result, 'trait_first') },
      { name: 'availability_first', fn: () => this.scheduleWithHeuristic(sortedShifts, result, 'availability_first') },
      { name: 'balanced', fn: () => this.scheduleWithHeuristic(sortedShifts, result, 'balanced') }
    ];

    for (const approach of approaches) {
      console.log(`[AdvancedScheduler] Trying approach: ${approach.name}`);
      
      // Reset assignments
      weekShifts.forEach(shift => {
        result.assignments[shift.id] = [];
      });
      result.iterations = 0;
      result.backtrackCount = 0;

      if (approach.fn()) {
        console.log(`[AdvancedScheduler] Success with approach: ${approach.name}, iterations: ${result.iterations}`);
        result.success = true;
        break;
      } else {
        console.log(`[AdvancedScheduler] Failed with approach: ${approach.name}, iterations: ${result.iterations}, backtracks: ${result.backtrackCount}`);
      }
    }

    // Generate warnings and errors
    this.generateResultMessages(result, weekShifts);

    return result;
  }

  /**
   * Sort shifts by difficulty - harder to fill shifts get priority
   */
  private sortShiftsByDifficulty(shifts: ShiftOccurrence[]): ShiftOccurrence[] {
    return [...shifts].sort((a, b) => {
      // Factors that make a shift harder to fill:
      // 1. More staff required
      // 2. More trait requirements
      // 3. Fewer available staff
      
      const aScore = this.calculateShiftDifficulty(a);
      const bScore = this.calculateShiftDifficulty(b);
      
      return bScore - aScore; // Higher difficulty first
    });
  }

  /**
   * Calculate how difficult a shift is to fill
   */
  private calculateShiftDifficulty(shift: ShiftOccurrence): number {
    let difficulty = 0;
    
    // Base difficulty from staff count
    difficulty += shift.requirements.staffCount * 10;
    
    // Additional difficulty from trait requirements
    if (shift.requirements.requiredTraits) {
      for (const trait of shift.requirements.requiredTraits) {
        const staffWithTrait = this.staff.filter(s => s.traitIds.includes(trait.traitId));
        difficulty += trait.minCount * (10 / Math.max(staffWithTrait.length, 1));
      }
    }
    
    // Difficulty based on available staff (considering basic constraints)
    const availableStaff = this.getBasicAvailableStaff(shift);
    const availability = availableStaff.length / Math.max(shift.requirements.staffCount, 1);
    difficulty += (1 / Math.max(availability, 0.1)) * 5;
    
    return difficulty;
  }

  /**
   * Get staff available for a shift based on basic constraints only
   */
  private getBasicAvailableStaff(shift: ShiftOccurrence): StaffMember[] {
    return this.staff.filter(staffMember => {
      // Check blocked time
      for (const blockedTime of staffMember.blockedTimes) {
        if (shift.startDateTime < blockedTime.endDateTime && 
            shift.endDateTime > blockedTime.startDateTime) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Schedule using different heuristics
   */
  private scheduleWithHeuristic(
    shifts: ShiftOccurrence[], 
    result: AdvancedSchedulingResult, 
    heuristic: 'trait_first' | 'availability_first' | 'balanced'
  ): boolean {
    const state: SchedulingState = {
      assignments: { ...result.assignments },
      unfilledShifts: shifts.map(s => s.id),
      constraintViolations: 0
    };

    return this.backtrackingSearch(shifts, state, result, heuristic, 0);
  }

  /**
   * Recursive backtracking search
   */
  private backtrackingSearch(
    shifts: ShiftOccurrence[],
    state: SchedulingState,
    result: AdvancedSchedulingResult,
    heuristic: string,
    depth: number
  ): boolean {
    result.iterations++;
    
    if (result.iterations > this.maxIterations || result.backtrackCount > this.maxBacktracks) {
      return false;
    }

    // Base case: all shifts filled
    if (state.unfilledShifts.length === 0) {
      result.assignments = { ...state.assignments };
      return true;
    }

    // Select next shift to fill using heuristic
    const shiftId = this.selectNextShift(shifts, state);
    const shift = shifts.find(s => s.id === shiftId)!;
    
    // Remove from unfilled list
    state.unfilledShifts = state.unfilledShifts.filter(id => id !== shiftId);

    // Try to fill this shift
    const success = this.fillShiftWithBacktracking(shift, shifts, state, result, heuristic, depth);
    
    if (!success) {
      // Backtrack: add shift back to unfilled list
      state.unfilledShifts.push(shiftId);
      result.backtrackCount++;
    }

    return success;
  }

  /**
   * Try to fill a single shift with backtracking
   */
  private fillShiftWithBacktracking(
    shift: ShiftOccurrence,
    allShifts: ShiftOccurrence[],
    state: SchedulingState,
    result: AdvancedSchedulingResult,
    heuristic: string,
    depth: number
  ): boolean {
    const needed = shift.requirements.staffCount;
    const candidates = this.getRankedCandidates(shift, allShifts, state, heuristic);

    console.log(`[AdvancedScheduler] Filling shift ${shift.name}, need ${needed} staff, found ${candidates.length} candidates`);
    
    // Use simple greedy assignment for this shift, then continue with backtracking
    const assigned: string[] = [];
    
    for (const candidate of candidates) {
      if (assigned.length >= needed) break;
      
      // Check if this candidate would create violations
      if (candidate.hardConstraintViolations > 0) {
        console.log(`[AdvancedScheduler] Skipping candidate ${candidate.staffId} due to hard violations: ${candidate.hardConstraintViolations}`);
        continue;
      }
      
      // Try assigning this candidate
      assigned.push(candidate.staffId);
    }
    
    // Check if we have enough staff for trait requirements
    if (shift.requirements.requiredTraits) {
      for (const trait of shift.requirements.requiredTraits) {
        const staffWithTrait = assigned.filter(staffId => {
          const staff = this.staff.find(s => s.id === staffId);
          return staff?.traitIds.includes(trait.traitId);
        });
        
        if (staffWithTrait.length < trait.minCount) {
          console.log(`[AdvancedScheduler] Failed to meet trait requirement: ${trait.traitId}, need ${trait.minCount}, got ${staffWithTrait.length}`);
          return false;
        }
      }
    }
    
    if (assigned.length < needed) {
      console.log(`[AdvancedScheduler] Failed to fill shift ${shift.name}, assigned ${assigned.length}/${needed}`);
      return false;
    }
    
    // Assign the staff
    state.assignments[shift.id] = assigned;
    console.log(`[AdvancedScheduler] Successfully filled shift ${shift.name} with ${assigned.length} staff`);
    
    // Continue with next shift
    return this.backtrackingSearch(allShifts, state, result, heuristic, depth + 1);
  }


  /**
   * Get ranked candidates for a shift
   */
  private getRankedCandidates(
    shift: ShiftOccurrence,
    allShifts: ShiftOccurrence[],
    state: SchedulingState,
    heuristic: string
  ): SchedulingCandidate[] {
    const candidates: SchedulingCandidate[] = [];

    for (const staffMember of this.staff) {
      // Skip if already assigned to this shift
      if (state.assignments[shift.id]?.includes(staffMember.id)) continue;

      const candidate = this.evaluateStaffForShift(
        staffMember, shift, allShifts, state, heuristic
      );
      
      if (candidate) {
        candidates.push(candidate);
      }
    }

    console.log(`[AdvancedScheduler] Evaluated ${candidates.length} candidates for shift ${shift.name}`);
    
    // Sort by priority (higher is better)
    const sorted = candidates.sort((a, b) => b.priority - a.priority);
    
    // Log top candidates for debugging
    if (sorted.length > 0) {
      console.log(`[AdvancedScheduler] Top candidate: ${sorted[0].staffId}, priority: ${sorted[0].priority}, hard violations: ${sorted[0].hardConstraintViolations}`);
    }
    
    return sorted;
  }

  /**
   * Evaluate a staff member for a shift
   */
  private evaluateStaffForShift(
    staffMember: StaffMember,
    shift: ShiftOccurrence,
    allShifts: ShiftOccurrence[],
    state: SchedulingState,
    heuristic: string
  ): SchedulingCandidate | null {
    // Create current state with existing assignments from the state
    const currentShifts = allShifts.map(s => ({
      ...s,
      assignedStaff: state.assignments[s.id] || []
    }));
    
    const currentShift = {
      ...shift,
      assignedStaff: state.assignments[shift.id] || []
    };

    // Use 'check_assignment' mode to simulate adding this staff member
    const context: ConstraintContext = {
      targetStaff: staffMember,
      targetOccurrence: currentShift,
      allStaff: this.staff,
      allOccurrences: currentShifts,
      evaluationDate: this.weekStart,
      t: this.t,
      language: this.language,
      mode: 'check_assignment'  // This will check "what if we add this staff member"
    };

    const violations = constraintEngine.validateStaffAssignment(context);
    const hardViolations = violations.filter(v => v.severity === 'error').length;
    const softViolations = violations.filter(v => v.severity === 'warning').length;
    const assignments = this.countCurrentAssignments(staffMember.id, state);
    
    // Debug constraint violations
    if (violations.length > 0) {
      console.log(`[AdvancedScheduler] Staff ${staffMember.name} has ${hardViolations} hard, ${softViolations} soft violations for shift ${shift.name}:`, 
        violations.map(v => `${v.violationType}:${v.severity}`));
    }

    // Calculate priority based on heuristic
    let priority = 100;

    switch (heuristic) {
      case 'trait_first':
        // Prioritize staff with required traits
        if (shift.requirements.requiredTraits) {
          for (const trait of shift.requirements.requiredTraits) {
            if (staffMember.traitIds.includes(trait.traitId)) {
              priority += 50;
            }
          }
        }
        priority -= hardViolations * 100;
        priority -= softViolations * 10;
        break;

      case 'availability_first':
        // Prioritize staff with fewer existing assignments
        priority -= assignments * 5;
        priority -= hardViolations * 100;
        priority -= softViolations * 10;
        break;

      case 'balanced':
        // Balance traits and availability
        if (shift.requirements.requiredTraits) {
          for (const trait of shift.requirements.requiredTraits) {
            if (staffMember.traitIds.includes(trait.traitId)) {
              priority += 25;
            }
          }
        }
        priority -= assignments * 3;
        priority -= hardViolations * 100;
        priority -= softViolations * 10;
        break;
    }

    return {
      staffId: staffMember.id,
      shiftId: shift.id,
      priority,
      hardConstraintViolations: hardViolations,
      softConstraintViolations: softViolations
    };
  }


  /**
   * Count current assignments for a staff member
   */
  private countCurrentAssignments(staffId: string, state: SchedulingState): number {
    let count = 0;
    for (const assignments of Object.values(state.assignments)) {
      if (assignments.includes(staffId)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Select next shift to fill using heuristic
   */
  private selectNextShift(
    _shifts: ShiftOccurrence[],
    state: SchedulingState
  ): string {
    // For now, just return the first unfilled shift
    // Could be improved with more sophisticated selection
    return state.unfilledShifts[0];
  }

  /**
   * Generate warning and error messages
   */
  private generateResultMessages(result: AdvancedSchedulingResult, shifts: ShiftOccurrence[]) {
    for (const shift of shifts) {
      const assigned = result.assignments[shift.id]?.length || 0;
      const required = shift.requirements.staffCount;
      
      if (assigned < required) {
        result.errors.push(
          this.t('autoScheduler.understaffedError', {
            shiftName: shift.name,
            date: formatLocalizedDateTime(shift.startDateTime, this.language),
            assigned,
            required
          })
        );
      }
    }
  }
}

/**
 * Enhanced auto-schedule function using the advanced algorithm
 */
export function advancedAutoScheduleWeek(
  shiftOccurrences: ShiftOccurrence[],
  staff: StaffMember[],
  weekStart: Date,
  traits: Trait[],
  t: TFunction,
  language: string
): AdvancedSchedulingResult {
  const scheduler = new AdvancedScheduler(staff, shiftOccurrences, traits, weekStart, t, language);
  return scheduler.schedule();
}