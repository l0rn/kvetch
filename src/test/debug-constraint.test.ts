import { describe, it } from 'vitest';
import { constraintEngine } from '../utils/constraints';
import type { ConstraintContext } from '../utils/constraints';

describe('Debug Constraint Engine', () => {
  it('should debug daily shift limit', () => {
    // Simple test case: Alice assigned to one shift on Monday morning
    const alice = {
      id: "alice",
      name: "Alice Smith",
      traitIds: [],
      constraints: {
        maxShiftsPerDay: 1,
        maxShiftsPerWeek: 5,
        maxShiftsPerMonth: 21,
        maxShiftsPerYear: 250,
        incompatibleWith: [],
        restDaysWithStaff: [],
        consecutiveRestDays: []
      },
      blockedTimes: []
    };

    const mondayMorning = {
      id: "mon-morning",
      name: "Monday Morning",
      startDateTime: new Date(2024, 0, 15, 9, 0), // 9 AM Monday
      endDateTime: new Date(2024, 0, 15, 13, 0),   // 1 PM Monday
      requirements: {
        staffCount: 1,
        requiredTraits: []
      },
      assignedStaff: [] // No assignments yet (testing assignment)
    };

    const mondayEvening = {
      id: "mon-evening", 
      name: "Monday Evening",
      startDateTime: new Date(2024, 0, 15, 17, 0), // 5 PM Monday
      endDateTime: new Date(2024, 0, 15, 21, 0),   // 9 PM Monday
      requirements: {
        staffCount: 1,
        requiredTraits: []
      },
      assignedStaff: [] // Empty
    };

    const context: ConstraintContext = {
      targetStaff: alice,
      targetOccurrence: mondayMorning,
      allStaff: [alice],
      allOccurrences: [mondayMorning, mondayEvening],
      evaluationDate: new Date(2024, 0, 15), // Monday
      t: (key: string) => key,
      language: 'en',
      mode: 'check_assignment'
    };

    console.log('\n=== CONSTRAINT ENGINE DEBUG ===');
    console.log('Testing Alice assignment to Monday Morning');
    console.log('Alice maxShiftsPerDay:', alice.constraints.maxShiftsPerDay);
    console.log('Monday Morning assigned staff:', mondayMorning.assignedStaff);
    console.log('Monday Evening assigned staff:', mondayEvening.assignedStaff);
    console.log('Mode:', context.mode);
    console.log('All occurrences dates:', [mondayMorning, mondayEvening].map(o => o.startDateTime.toISOString()));
    
    // Log what the constraint logic should see:
    const periodsStart = new Date(2024, 0, 15, 0, 0); // Start of Monday
    const periodEnd = new Date(2024, 0, 15, 23, 59); // End of Monday
    console.log('Daily period:', periodsStart.toISOString(), 'to', periodEnd.toISOString());
    
    // Count shifts in period manually
    let shiftsInPeriod = 0;
    for (const occ of [mondayMorning, mondayEvening]) {
      if (occ.startDateTime >= periodsStart && occ.startDateTime <= periodEnd) {
        if (occ.assignedStaff.includes('alice')) {
          shiftsInPeriod++;
        }
      }
    }
    console.log('Manual shiftsInPeriod calculation:', shiftsInPeriod);
    console.log('Expected logic: (shiftsInPeriod + 1) > maxShifts =>', `(${shiftsInPeriod} + 1) > ${alice.constraints.maxShiftsPerDay}`, '=>', (shiftsInPeriod + 1) > alice.constraints.maxShiftsPerDay);

    const violations = constraintEngine.validateStaffAssignment(context);

    console.log('\n=== VIOLATIONS ===');
    console.log('Total violations:', violations.length);
    violations.forEach((v, i) => {
      console.log(`Violation ${i+1}:`, v.severity, '-', v.message);
    });

    console.log('\n==============================\n');
    
    // Force failure to see output
    if (violations.length > 0) {
      throw new Error(`Found ${violations.length} violations: ${violations.map(v => v.message).join(', ')}`);
    }
  });
});