import type { TestCase } from '../fixtures/testCases';
import type { CSPSchedulingResult } from '../../utils/cspScheduler';
import { constraintEngine, type ConstraintContext } from '../../utils/constraints';

/**
 * Validation utilities for CSP scheduler test results using ConstraintEngine
 */

export interface ValidationResult {
  passed: boolean;
  correctAssignments: boolean;
  constraintsSatisfied: boolean;
  errors: string[];
  warnings: string[];
  constraintViolations: Array<{
    staffName: string;
    shiftName: string;
    violation: string;
    severity: 'error' | 'warning';
  }>;
}

/**
 * Validate CSP result using the same ConstraintEngine used by the application
 */
export function validateCSPResult(testCase: TestCase, result: CSPSchedulingResult): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const constraintViolations: ValidationResult['constraintViolations'] = [];
  
  // Check if the test case should succeed or fail
  if (testCase.shouldSucceed && !result.success) {
    errors.push(`Expected success but CSP scheduler failed: ${result.errors?.join(', ') || 'Unknown error'}`);
    return { 
      passed: false, 
      correctAssignments: false, 
      constraintsSatisfied: false, 
      errors, 
      warnings, 
      constraintViolations 
    };
  }
  
  if (!testCase.shouldSucceed && result.success) {
    warnings.push('Expected failure but CSP scheduler succeeded - this might be okay if we found an alternative valid solution');
  }
  
  if (!result.success) {
    // For expected failures, this is okay
    if (!testCase.shouldSucceed) {
      return { 
        passed: true, 
        correctAssignments: true, 
        constraintsSatisfied: true, 
        errors, 
        warnings, 
        constraintViolations 
      };
    }
    return { 
      passed: false, 
      correctAssignments: false, 
      constraintsSatisfied: false, 
      errors, 
      warnings, 
      constraintViolations 
    };
  }
  
  // Convert CSP result to shift occurrences for ConstraintEngine validation
  const updatedShifts = convertCSPResultToShifts(testCase, result);
  
  // Use ConstraintEngine to validate all assignments
  const allViolations = validateAllAssignments(testCase, updatedShifts);
  
  // Process violations
  for (const violation of allViolations) {
    constraintViolations.push({
      staffName: violation.staffName,
      shiftName: violation.shiftName,
      violation: violation.message,
      severity: violation.severity
    });
    
    if (violation.severity === 'error') {
      errors.push(`${violation.staffName} on ${violation.shiftName}: ${violation.message}`);
    } else {
      warnings.push(`${violation.staffName} on ${violation.shiftName}: ${violation.message}`);
    }
  }
  
  // Check basic assignment completeness
  let correctAssignments = true;
  if (testCase.shouldSucceed) {
    for (const shift of testCase.shifts) {
      const assignedCount = (result.assignments[shift.id] || []).length;
      const requiredCount = shift.requirements.staffCount;
      
      if (assignedCount !== requiredCount) {
        correctAssignments = false;
        errors.push(`Shift ${shift.name}: expected ${requiredCount} staff, got ${assignedCount}`);
      }
    }
  }
  
  const constraintsSatisfied = constraintViolations.filter(v => v.severity === 'error').length === 0;
  const passed = errors.length === 0;
  
  return { 
    passed, 
    correctAssignments, 
    constraintsSatisfied, 
    errors, 
    warnings, 
    constraintViolations 
  };
}

/**
 * Convert CSP scheduling result back to shift occurrences with assignments
 */
function convertCSPResultToShifts(testCase: TestCase, result: CSPSchedulingResult) {
  return testCase.shifts.map(shift => ({
    ...shift,
    assignedStaff: result.assignments[shift.id] || []
  }));
}

/**
 * Validate all assignments using ConstraintEngine (same as the app uses)
 */
function validateAllAssignments(testCase: TestCase, shifts: any[]) {
  const violations: Array<{
    staffName: string;
    shiftName: string;
    message: string;
    severity: 'error' | 'warning';
  }> = [];
  
  // Validate each staff assignment using the ConstraintEngine
  for (const shift of shifts) {
    for (const staffId of shift.assignedStaff) {
      const staffMember = testCase.staff.find(s => s.id === staffId);
      if (!staffMember) continue;
      
      const context: ConstraintContext = {
        targetStaff: staffMember,
        targetOccurrence: shift,
        allStaff: testCase.staff,
        allOccurrences: shifts,
        evaluationDate: testCase.weekStart,
        t: mockTranslation,
        language: 'en',
        mode: 'check_assignment'
      };
      
      const constraintViolations = constraintEngine.validateStaffAssignment(context);
      
      for (const violation of constraintViolations) {
        violations.push({
          staffName: staffMember.name,
          shiftName: shift.name,
          message: violation.message,
          severity: violation.severity === 'error' ? 'error' : 'warning'
        });
      }
    }
  }
  
  return violations;
}

/**
 * Create a human-readable test result summary
 */
export function formatTestResult(testCase: TestCase, result: CSPSchedulingResult, validation: ValidationResult): string {
  const status = validation.passed ? '✅ PASSED' : '❌ FAILED';
  const lines = [
    `${status}: ${testCase.name}`,
    `  Description: ${testCase.description}`,
    `  CSP Success: ${result.success}`,
    `  Algorithm: ${result.algorithm || 'N/A'}`,
    `  Quality: ${result.solutionQuality ? Math.round(result.solutionQuality * 100) + '%' : 'N/A'}`,
    `  Iterations: ${result.iterations || 0}`
  ];
  
  if (result.success && result.assignments) {
    lines.push('  Assignments:');
    for (const [shiftId, staffIds] of Object.entries(result.assignments)) {
      if (staffIds.length > 0) {
        const staffNames = staffIds.map(id => testCase.staff.find(s => s.id === id)?.name || id);
        lines.push(`    ${shiftId}: ${staffNames.join(', ')}`);
      }
    }
  }
  
  if (validation.errors.length > 0) {
    lines.push('  Errors:');
    validation.errors.forEach(error => lines.push(`    • ${error}`));
  }
  
  if (validation.warnings.length > 0) {
    lines.push('  Warnings:');
    validation.warnings.forEach(warning => lines.push(`    • ${warning}`));
  }
  
  return lines.join('\n');
}

/**
 * Simple translation function for tests
 */
export function mockTranslation(key: string): string {
  return key;
}

/**
 * Run test case and return detailed results
 */
export function runTestCase(
  testCase: TestCase, 
  cspScheduler: (
    shifts: any[], 
    staff: any[], 
    weekStart: Date, 
    traits: any[], 
    t: (key: string) => string, 
    language: string
  ) => CSPSchedulingResult
): { result: CSPSchedulingResult; validation: ValidationResult; summary: string } {
  
  // Run the CSP scheduler
  const result = cspScheduler(
    testCase.shifts,
    testCase.staff,
    testCase.weekStart,
    testCase.traits,
    mockTranslation,
    'en'
  );
  
  // Validate the result
  const validation = validateCSPResult(testCase, result);
  
  // Create summary
  const summary = formatTestResult(testCase, result, validation);
  
  return { result, validation, summary };
}