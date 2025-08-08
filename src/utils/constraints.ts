import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, differenceInDays, isSameDay, format, addDays } from 'date-fns';
import type { ShiftOccurrence, StaffMember } from '../storage/database-pouchdb';
import type { TFunction } from 'i18next';
import { formatLocalizedDate } from './datetime';

// =============================================================================
// CONSTRAINT SYSTEM - Centralized validation for staff scheduling constraints
// =============================================================================

/**
 * Helper function to generate localized period names
 */
function getLocalizedPeriodName(
  limitType: 'daily' | 'weekly' | 'monthly' | 'yearly',
  date: Date,
  periodStart: Date,
  t: TFunction,
  language: string
): string {
  const weekStartFormatted = periodStart.toLocaleDateString(language, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  switch (limitType) {
    case 'daily':
      return date.toLocaleDateString(language, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    case 'weekly':

      return t('constraints.weekOf', { date: weekStartFormatted });
    case 'monthly':
      return date.toLocaleDateString(language, {
        year: 'numeric',
        month: 'long'
      });
    case 'yearly':
      return date.getFullYear().toString();
  }
}

/**
 * Helper function to translate period types (week/month)
 */
function getTranslatedPeriod(period: 'week' | 'month', t: TFunction): string {
  return period === 'week' ? t('staff.week') : t('staff.month');
}

/**
 * Standardized constraint violation interface
 */
export interface ConstraintViolation {
  id: string;
  staffId: string;
  staffName: string;
  violationType: ConstraintType;
  severity: 'error' | 'warning' | 'info';
  message: string;
  details: {
    constraintName: string;
    currentValue?: number | string;
    limitValue?: number | string;
    period?: string;
    relatedStaffId?: string;
    relatedStaffName?: string;
  };
}

/**
 * All supported constraint types - centralized enum for consistency
 */
export type ConstraintType = 
  | 'blocked_time'           // Blocked time conflicts
  | 'incompatible_staff'     // Cannot work with specific staff
  | 'daily_shift_limit'      // Max shifts per day
  | 'weekly_shift_limit'     // Max shifts per week  
  | 'monthly_shift_limit'    // Max shifts per month
  | 'yearly_shift_limit'     // Max shifts per year
  | 'rest_days_with_staff'   // Min days without shifts with specific staff
  | 'consecutive_rest_days'; // Min consecutive days without shifts

/**
 * Context for constraint evaluation - all data needed to check constraints
 */
export interface ConstraintContext {
  targetStaff: StaffMember;
  targetOccurrence: ShiftOccurrence;
  allStaff: StaffMember[];
  allOccurrences: ShiftOccurrence[];
  evaluationDate: Date;
  t: TFunction; // Required for internationalization - all constraint messages must be translated
  language: string; // Language code for localization
  // Mode of evaluation - determines the behavior of constraint checking
  mode?: 'check_assignment' | 'validate_existing';
  // 'check_assignment': Check if adding this assignment would violate constraints (for auto-scheduler)
  // 'validate_existing': Check if current assignments already violate constraints (for status display)
}

/**
 * Enhanced constraint definitions for StaffMember
 */
export interface StaffConstraints {
  // Existing constraints
  maxShiftsPerDay?: number;
  maxShiftsPerWeek?: number;
  maxShiftsPerMonth?: number;
  maxShiftsPerYear?: number;
  incompatibleWith: string[];
  
  // New constraint types
  restDaysWithStaff?: Array<{
    staffId: string;
    minRestDays: number;
    period: 'week' | 'month';
  }>;
  
  consecutiveRestDays?: Array<{
    minConsecutiveDays: number;
    period: 'week' | 'month';
  }>;
}

/**
 * Individual constraint validator interface
 */
export interface ConstraintValidator {
  type: ConstraintType;
  validate(context: ConstraintContext): ConstraintViolation[];
}

// =============================================================================
// CONSTRAINT VALIDATORS - Individual constraint checking logic
// =============================================================================

/**
 * Validates blocked time conflicts
 */
export class BlockedTimeConstraint implements ConstraintValidator {
  type: ConstraintType = 'blocked_time';

  validate(context: ConstraintContext): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];
    const { targetStaff, targetOccurrence } = context;
    
    // Generate all blocked time occurrences for the target staff
    const blockedOccurrences = this.generateBlockedTimeOccurrences(
      targetStaff, 
      addDays(context.evaluationDate, -365), // Look back 1 year
      addDays(context.evaluationDate, 365)   // Look forward 1 year
    );
    
    const shiftStart = targetOccurrence.startDateTime;
    const shiftEnd = targetOccurrence.endDateTime;
    
    for (const blocked of blockedOccurrences) {
      // Check for time overlap
      if (shiftStart < blocked.endDateTime && shiftEnd > blocked.startDateTime) {
        violations.push({
          id: `blocked_time_${targetStaff.id}_${targetOccurrence.id}`,
          staffId: targetStaff.id,
          staffName: targetStaff.name,
          violationType: 'blocked_time',
          severity: 'error',
          message: context.t('constraints.blockedTimeConflict', {
            staffName: targetStaff.name,
            shiftName: targetOccurrence.name,
            shiftTime: `${format(targetOccurrence.startDateTime, 'HH:mm')} - ${format(targetOccurrence.endDateTime, 'HH:mm')}`,
            shiftDate: formatLocalizedDate(targetOccurrence.startDateTime, context.language),
            blockedTime: `${format(blocked.startDateTime, 'HH:mm')} - ${format(blocked.endDateTime, 'HH:mm')}`,
            blockedDate: formatLocalizedDate(blocked.startDateTime, context.language)
          }),
          details: {
            constraintName: 'Blocked Time',
            period: formatLocalizedDate(blocked.startDateTime, context.language)
          }
        });
      }
    }
    
    return violations;
  }

  private generateBlockedTimeOccurrences(
    staff: StaffMember,
    startDate: Date,
    endDate: Date
  ): Array<{ startDateTime: Date; endDateTime: Date }> {
    const occurrences: Array<{ startDateTime: Date; endDateTime: Date }> = [];
    
    for (const blockedTime of staff.blockedTimes) {
      if (!blockedTime.recurrence) {
        // Include blocked time if it overlaps with the date range at all
        if (blockedTime.startDateTime < endDate && blockedTime.endDateTime > startDate) {
          occurrences.push({
            startDateTime: blockedTime.startDateTime,
            endDateTime: blockedTime.endDateTime
          });
        }
      } else {
        // Recurring blocked time - use the improved logic from autoScheduler
        const baseStart = blockedTime.startDateTime;
        const baseEnd = blockedTime.endDateTime;
        const duration = baseEnd.getTime() - baseStart.getTime();
        const recurrenceEnd = blockedTime.recurrence.endDate ? blockedTime.recurrence.endDate : endDate;
        const { type, interval, weekdays } = blockedTime.recurrence;
        
        if (type === 'weekly' && weekdays && weekdays.length > 0) {
          // Special handling for weekday-specific weekly recurrence
          const sortedWeekdays = [...weekdays].sort((a, b) => a - b);
          const baseWeekStart = startOfWeek(baseStart, { weekStartsOn: 0 });
          
          // Start from the beginning of the search range and work forward week by week
          let currentWeekStart = startOfWeek(startDate, { weekStartsOn: 0 });
          
          // Continue until we exceed the recurrence end or search end
          while (currentWeekStart <= recurrenceEnd && currentWeekStart <= endDate) {
            // Calculate how many weeks since the base week start
            const weeksSinceBase = Math.floor((currentWeekStart.getTime() - baseWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
            
            // Check if this week matches the recurrence interval (e.g., every 2 weeks)
            if (weeksSinceBase >= 0 && weeksSinceBase % interval === 0) {
              // Check each specified weekday in this week
              for (const weekday of sortedWeekdays) {
                const currentOccurrenceStart = addDays(currentWeekStart, weekday);
                const currentOccurrenceEnd = new Date(currentOccurrenceStart.getTime() + duration);
                
                // Only include if:
                // 1. The occurrence is on or after the base start date (original blocked time start)
                // 2. The occurrence is within the recurrence period
                // 3. The occurrence overlaps with the query date range
                if (currentOccurrenceStart >= baseStart && 
                    currentOccurrenceStart <= recurrenceEnd && 
                    currentOccurrenceStart < endDate && 
                    currentOccurrenceEnd > startDate) {
                  
                  occurrences.push({
                    startDateTime: currentOccurrenceStart,
                    endDateTime: currentOccurrenceEnd
                  });
                }
              }
            }
            
            // Move to the next week
            currentWeekStart = addDays(currentWeekStart, 7);
          }
        } else {
          // Standard recurrence logic for daily/monthly or weekly without specific weekdays
          const current = new Date(baseStart);
          
          while (current <= recurrenceEnd && current <= endDate) {
            const occEnd = new Date(current.getTime() + duration);
            
            // Include if this occurrence overlaps with the date range
            if (current < endDate && occEnd > startDate) {
              occurrences.push({
                startDateTime: new Date(current),
                endDateTime: occEnd
              });
            }
            
            // Move to next occurrence
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
    }
    
    return occurrences;
  }
}

/**
 * Validates incompatible staff constraints
 */
export class IncompatibleStaffConstraint implements ConstraintValidator {
  type: ConstraintType = 'incompatible_staff';

  validate(context: ConstraintContext): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];
    const { targetStaff, targetOccurrence, allStaff } = context;
    
    const currentlyAssigned = targetOccurrence.assignedStaff || [];

    for (const assignedStaffId of currentlyAssigned) {
      // Skip if it's the same staff member
      if (assignedStaffId === targetStaff.id) continue;
      
      const assignedStaff = allStaff.find(s => s.id === assignedStaffId);
      if (!assignedStaff) continue;
      
      // Check bidirectional incompatibility
      const isIncompatible = 
        targetStaff.constraints.incompatibleWith.includes(assignedStaffId) ||
        assignedStaff.constraints.incompatibleWith.includes(targetStaff.id);
      
      if (isIncompatible) {
        violations.push({
          id: `incompatible_${targetStaff.id}_${assignedStaffId}_${targetOccurrence.id}`,
          staffId: targetStaff.id,
          staffName: targetStaff.name,
          violationType: 'incompatible_staff',
          severity: 'error',
          message: context.t('constraints.incompatibleStaffConflict', {
            staffName: targetStaff.name,
            conflictStaffName: assignedStaff.name,
            shiftName: targetOccurrence.name,
            shiftTime: `${format(targetOccurrence.startDateTime, 'HH:mm')} - ${format(targetOccurrence.endDateTime, 'HH:mm')}`,
            shiftDate: formatLocalizedDate(targetOccurrence.startDateTime, context.language)
          }),
          details: {
            constraintName: 'Incompatible Staff',
            relatedStaffId: assignedStaffId,
            relatedStaffName: assignedStaff.name
          }
        });
      }
    }
    
    return violations;
  }
}

/**
 * Validates shift count limits (daily/weekly/monthly/yearly)
 */
export class ShiftLimitConstraint implements ConstraintValidator {
  type: ConstraintType;

  private limitType: 'daily' | 'weekly' | 'monthly' | 'yearly';
  
  constructor(limitType: 'daily' | 'weekly' | 'monthly' | 'yearly') {
    this.limitType = limitType;
    switch (limitType) {
      case 'daily':
        this.type = 'daily_shift_limit';
        break;
      case 'weekly':
        this.type = 'weekly_shift_limit';
        break;
      case 'monthly':
        this.type = 'monthly_shift_limit';
        break;
      case 'yearly':
        this.type = 'yearly_shift_limit';
        break;
    }
  }

  validate(context: ConstraintContext): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];
    const { targetStaff, targetOccurrence, allOccurrences, mode = 'check_assignment' } = context;
    
    const constraints = targetStaff.constraints;
    let maxShifts: number | undefined;
    let periodStart: Date;
    let periodEnd: Date;

    // Set period boundaries and limits based on constraint type
    const occurrenceDate = targetOccurrence.startDateTime;
    switch (this.limitType) {
      case 'daily':
        maxShifts = constraints.maxShiftsPerDay ?? 1; // Default 1 per day
        periodStart = startOfDay(occurrenceDate);
        periodEnd = endOfDay(occurrenceDate);
        break;
      case 'weekly':
        maxShifts = constraints.maxShiftsPerWeek ?? 5;
        periodStart = startOfWeek(occurrenceDate);
        periodEnd = endOfWeek(occurrenceDate);
        break;
      case 'monthly':
        maxShifts = constraints.maxShiftsPerMonth ?? 21;
        periodStart = startOfMonth(occurrenceDate);
        periodEnd = endOfMonth(occurrenceDate);
        break;
      case 'yearly':
        maxShifts = constraints.maxShiftsPerYear;
        periodStart = startOfYear(occurrenceDate);
        periodEnd = endOfYear(occurrenceDate);
        break;
    }

    // Generate localized period name
    const periodName = getLocalizedPeriodName(this.limitType, occurrenceDate, periodStart, context.t, context.language);

    // Skip if no limit is set
    if (maxShifts === undefined) return violations;

    // Count existing shifts in period
    let shiftsInPeriod = 0;
    for (const occurrence of allOccurrences) {
      const occStart = occurrence.startDateTime;
      if (occStart >= periodStart && occStart <= periodEnd) {
        const assignments = occurrence.assignedStaff ?? [];
        if (assignments.includes(targetStaff.id)) {
          shiftsInPeriod++;
        }
      }
    }

    // Check constraints based on mode
    let isViolation = false;
    let currentValue: number;

    if (mode === 'check_assignment') {
      // For preliminary assignment checks: Would adding this assignment exceed the limit?
      // Fixed: shiftsInPeriod + 1 should not exceed maxShifts
      isViolation = (shiftsInPeriod + 1) > maxShifts;
      currentValue = shiftsInPeriod + 1;
    } else {
      // For existing assignment validation: Does the current state exceed the limit?
      isViolation = shiftsInPeriod > maxShifts;
      currentValue = shiftsInPeriod;
    }

    if (isViolation) {
      
      const baseMessageKey = mode === 'check_assignment' ? 'constraints.shiftLimitWouldExceed' : 'constraints.shiftLimitExceeded';
      
      violations.push({
        id: `${this.limitType}_limit_${targetStaff.id}_${targetOccurrence.id}`,
        staffId: targetStaff.id,
        staffName: targetStaff.name,
        violationType: this.type,
        severity: 'error',
        message: context.t(baseMessageKey, {
          staffName: targetStaff.name,
          shiftName: targetOccurrence.name,
          shiftTime: `${format(targetOccurrence.startDateTime, 'HH:mm')} - ${format(targetOccurrence.endDateTime, 'HH:mm')}`,
          shiftDate: formatLocalizedDate(targetOccurrence.startDateTime, context.language),
          limitType: context.t(`common.${this.limitType}`),
          current: currentValue,
          limit: maxShifts,
          period: periodName
        }),
        details: {
          constraintName: `${this.limitType.charAt(0).toUpperCase() + this.limitType.slice(1)} Shift Limit`,
          currentValue,
          limitValue: maxShifts,
          period: periodName
        }
      });
    }

    return violations;
  }
}

/**
 * Validates minimum rest days with specific staff constraint
 */
export class RestDaysWithStaffConstraint implements ConstraintValidator {
  type: ConstraintType = 'rest_days_with_staff';

  validate(context: ConstraintContext): ConstraintViolation[] {

    const violations: ConstraintViolation[] = [];
    const { targetStaff, targetOccurrence, allStaff, allOccurrences, mode = 'check_assignment' } = context;
    
    const restConstraints = (targetStaff.constraints as StaffConstraints).restDaysWithStaff || [];
    
    for (const restConstraint of restConstraints) {
      const relatedStaff = allStaff.find(s => s.id === restConstraint.staffId);
      if (!relatedStaff) continue;
      
      if (mode !== 'check_assignment' && !targetOccurrence.assignedStaff?.includes(targetStaff.id)) {
        continue;
      }
      
      // Define period boundaries
      const occurrenceDate = targetOccurrence.startDateTime;
      const periodStart = restConstraint.period === 'week' 
        ? startOfWeek(occurrenceDate) 
        : startOfMonth(occurrenceDate);
      const periodEnd = restConstraint.period === 'week'
        ? endOfWeek(occurrenceDate)
        : endOfMonth(occurrenceDate);
      
      // Count days when both staff worked together
      let restDaysTogether = this.countWorkDaysWithoutStaff(
        [targetStaff.id, restConstraint.staffId],
        allOccurrences,
        periodStart,
        periodEnd
      );

      // If mode is 'check_assignment', we need to account for the current assignment
      if (mode === 'check_assignment') {
        restDaysTogether -= 1;
      }

      if (restDaysTogether < restConstraint.minRestDays) {
        violations.push({
          id: `rest_days_staff_${targetStaff.id}_${restConstraint.staffId}_${targetOccurrence.id}`,
          staffId: targetStaff.id,
          staffName: targetStaff.name,
          violationType: 'rest_days_with_staff',
          severity: 'error',
          message: context.t('constraints.restDaysWithStaffViolation', {
            staffName: targetStaff.name,
            relatedStaffName: relatedStaff.name,
            shiftName: targetOccurrence.name,
            shiftTime: `${format(targetOccurrence.startDateTime, 'HH:mm')} - ${format(targetOccurrence.endDateTime, 'HH:mm')}`,
            shiftDate: formatLocalizedDate(targetOccurrence.startDateTime, context.language),
            current: restDaysTogether,
            required: restConstraint.minRestDays,
            period: getTranslatedPeriod(restConstraint.period, context.t)
          }),
          details: {
            constraintName: 'Rest Days with Staff',
            currentValue: restDaysTogether,
            limitValue: restConstraint.minRestDays,
            period: getTranslatedPeriod(restConstraint.period, context.t),
            relatedStaffId: restConstraint.staffId,
            relatedStaffName: relatedStaff.name
          }
        });
      }
    }
    
    return violations;
  }

  private countWorkDaysWithoutStaff(
    staffIds: string[],
    occurrences: ShiftOccurrence[],
    periodStart: Date,
    periodEnd: Date
  ): number {
    const workDays = new Set<string>();
    for (const occurrence of occurrences) {
      const occStart = occurrence.startDateTime;
      if (occStart >= periodStart && occStart <= periodEnd) {
        const occAssignments = occurrence.assignedStaff ?? [];
        if (occAssignments.some(staffId => staffIds.includes(staffId))) {
          workDays.add(format(startOfDay(occStart), 'yyyy-MM-dd'));
        }
      }
    }
    
    return differenceInDays(periodEnd, periodStart) + 1 - workDays.size;
  }
}

/**
 * Validates consecutive rest days constraint
 */
export class ConsecutiveRestDaysConstraint implements ConstraintValidator {
  type: ConstraintType = 'consecutive_rest_days';

  validate(context: ConstraintContext): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];
    const { targetStaff, targetOccurrence, allOccurrences } = context;
    
    const restConstraints = (targetStaff.constraints as StaffConstraints).consecutiveRestDays || [];
    
    for (const restConstraint of restConstraints) {
      // Define period boundaries
      const occurrenceDate = targetOccurrence.startDateTime;
      const periodStart = restConstraint.period === 'week'
        ? startOfWeek(occurrenceDate)
        : startOfMonth(occurrenceDate);
      const periodEnd = restConstraint.period === 'week'
        ? endOfWeek(occurrenceDate)
        : endOfMonth(occurrenceDate);
      
      // Get all work days for this staff in the period
      const workDays = this.getWorkDays(
        targetStaff.id,
        allOccurrences,
        periodStart,
        periodEnd
      );
      
      // Find maximum consecutive rest days
      const maxConsecutiveRest = this.findMaxConsecutiveRestDays(workDays, periodStart, periodEnd);
      
      if (maxConsecutiveRest < restConstraint.minConsecutiveDays) {
        violations.push({
          id: `consecutive_rest_${targetStaff.id}_${targetOccurrence.id}`,
          staffId: targetStaff.id,
          staffName: targetStaff.name,
          violationType: 'consecutive_rest_days',
          severity: 'error',
          message: context.t('constraints.consecutiveRestDaysViolation', {
            staffName: targetStaff.name,
            shiftName: targetOccurrence.name,
            shiftTime: `${format(targetOccurrence.startDateTime, 'HH:mm')} - ${format(targetOccurrence.endDateTime, 'HH:mm')}`,
            shiftDate: formatLocalizedDate(targetOccurrence.startDateTime, context.language),
            current: maxConsecutiveRest,
            required: restConstraint.minConsecutiveDays,
            period: getTranslatedPeriod(restConstraint.period, context.t)
          }),
          details: {
            constraintName: 'Consecutive Rest Days',
            currentValue: maxConsecutiveRest,
            limitValue: restConstraint.minConsecutiveDays,
            period: getTranslatedPeriod(restConstraint.period, context.t)
          }
        });
      }
    }
    
    return violations;
  }

  private getWorkDays(
    staffId: string,
    occurrences: ShiftOccurrence[],
    periodStart: Date,
    periodEnd: Date
  ): Date[] {
    const workDaySet = new Set<string>();
    
    for (const occurrence of occurrences) {
      const occStart = occurrence.startDateTime;
      if (occStart >= periodStart && occStart <= periodEnd) {
        const occAssignments = occurrence.assignedStaff || [];
        if (occAssignments.includes(staffId)) {
          workDaySet.add(format(startOfDay(occStart), 'yyyy-MM-dd'));
        }
      }
    }
    
    return Array.from(workDaySet)
      .map(dateStr => new Date(dateStr))
      .sort((a, b) => a.getTime() - b.getTime());
  }

  private findMaxConsecutiveRestDays(workDays: Date[], periodStart: Date, periodEnd: Date): number {
    if (workDays.length === 0) {
      return differenceInDays(periodEnd, periodStart) + 1;
    }

    let maxConsecutiveRest = 0;
    let currentConsecutiveRest = 0;
    
    // Check each day in the period
    for (let date = new Date(periodStart); date <= periodEnd; date = addDays(date, 1)) {
      const isWorkDay = workDays.some(workDay => isSameDay(workDay, date));
      
      if (isWorkDay) {
        // Reset consecutive rest counter
        maxConsecutiveRest = Math.max(maxConsecutiveRest, currentConsecutiveRest);
        currentConsecutiveRest = 0;
      } else {
        // Increment consecutive rest days
        currentConsecutiveRest++;
      }
    }
    
    // Check final sequence
    maxConsecutiveRest = Math.max(maxConsecutiveRest, currentConsecutiveRest);
    
    return maxConsecutiveRest;
  }
}

// =============================================================================
// CONSTRAINT ENGINE - Centralized validation orchestrator
// =============================================================================

/**
 * Main constraint validation engine
 */
export class ConstraintEngine {
  private validators: ConstraintValidator[] = [
    new BlockedTimeConstraint(),
    new IncompatibleStaffConstraint(),
    new ShiftLimitConstraint('daily'),
    new ShiftLimitConstraint('weekly'),
    new ShiftLimitConstraint('monthly'),
    new ShiftLimitConstraint('yearly'),
    new RestDaysWithStaffConstraint(),
    new ConsecutiveRestDaysConstraint()
  ];

  /**
   * Validates all constraints for a staff assignment
   */
  validateStaffAssignment(context: ConstraintContext): ConstraintViolation[] {
    const allViolations: ConstraintViolation[] = [];

    for (const validator of this.validators) {
      try {
        const violations = validator.validate(context);
        allViolations.push(...violations);
      } catch (error) {
        console.error(`Error validating constraint ${validator.type}:`, error);
        // Continue with other constraints even if one fails
      }
    }
    
    return this.prioritizeViolations(allViolations);
  }

  /**
   * Check if a staff assignment is valid (no error-level violations)
   */
  isAssignmentValid(context: ConstraintContext): boolean {
    const violations = this.validateStaffAssignment(context);
    return !violations.some(v => v.severity === 'error');
  }

  /**
   * Get violations by severity level
   */
  getViolationsBySeverity(violations: ConstraintViolation[], severity: 'error' | 'warning' | 'info'): ConstraintViolation[] {
    return violations.filter(v => v.severity === severity);
  }

  /**
   * Prioritize violations for display (errors first, then warnings, then info)
   */
  private prioritizeViolations(violations: ConstraintViolation[]): ConstraintViolation[] {
    return violations.sort((a, b) => {
      const severityOrder = { error: 0, warning: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Add custom constraint validator
   */
  addValidator(validator: ConstraintValidator): void {
    this.validators.push(validator);
  }

  /**
   * Remove constraint validator by type
   */
  removeValidator(type: ConstraintType): void {
    this.validators = this.validators.filter(v => v.type !== type);
  }
}

/**
 * Global constraint engine instance
 */
export const constraintEngine = new ConstraintEngine();

/**
 * Convenience function for quick constraint validation
 * Note: Translation function (t) is required in the context
 */
export function validateConstraints(context: ConstraintContext): ConstraintViolation[] {
  return constraintEngine.validateStaffAssignment(context);
}

/**
 * Convenience function to check if assignment is valid
 * Note: Translation function (t) is required in the context
 */
export function isValidAssignment(context: ConstraintContext): boolean {
  return constraintEngine.isAssignmentValid(context);
}