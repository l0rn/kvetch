import { describe, it, expect } from 'vitest';
import { yalpsAutoScheduleWeek } from '../utils/yalpsScheduler';
import type { ShiftOccurrence } from '../storage/database-pouchdb';
import type { TFunction } from 'i18next';

// Mock TFunction for tests
const mockTFunction: TFunction = ((key: string) => key) as TFunction;

describe('YALPS Scheduler Test', () => {
  it('should solve simple scheduling problem', () => {
    const staff = [
      {
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
      },
      {
        id: "bob",
        name: "Bob Wilson",
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
      }
    ];

    const shifts = [
      {
        id: "mon-morning",
        name: "Monday Morning",
        startDateTime: new Date(2024, 0, 15, 9, 0),
        endDateTime: new Date(2024, 0, 15, 13, 0),
        requirements: {
          staffCount: 1,
          requiredTraits: []
        },
        assignedStaff: [],
        parentShiftId: "mon-morning",
        isModified: false,
        isDeleted: false
      },
      {
        id: "mon-evening", 
        name: "Monday Evening",
        startDateTime: new Date(2024, 0, 15, 17, 0),
        endDateTime: new Date(2024, 0, 15, 21, 0),
        requirements: {
          staffCount: 1,
          requiredTraits: []
        },
        assignedStaff: [],
        parentShiftId: "mon-evening",
        isModified: false,
        isDeleted: false
      }
    ] as ShiftOccurrence[];

    const weekStart = new Date(2024, 0, 15);

    console.log('\n=== YALPS SCHEDULER TEST ===');
    console.log('Testing 2 staff, 2 shifts with YALPS');
    
    const result = yalpsAutoScheduleWeek(shifts as unknown as ShiftOccurrence[], staff, weekStart, mockTFunction);
    
    console.log('Result success:', result.success);
    console.log('Assignments:', JSON.stringify(result.assignments, null, 2));
    console.log('Errors:', result.errors);
    console.log('Algorithm:', result.algorithm);
    console.log('Objective value:', result.objective);
    
    console.log('===========================\n');
    
    // Verify results
    expect(result.success).toBe(true);
    expect(result.algorithm).toBe('yalps-linear-programming');
    
    if (result.success) {
      // Check that each shift has the required number of staff
      for (const shift of shifts) {
        const assigned = result.assignments[shift.id] || [];
        expect(assigned.length).toBe(shift.requirements.staffCount);
      }
      
      // Check that all assigned staff are valid
      const allAssignedStaff = Object.values(result.assignments).flat();
      for (const staffId of allAssignedStaff) {
        expect(staff.some(s => s.id === staffId)).toBe(true);
      }
      
      console.log('✅ All basic checks passed!');
    }
  });

  it('should handle trait requirements', () => {
    const staff = [
      {
        id: "alice",
        name: "Alice Smith", 
        traitIds: ["manager"],
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
      },
      {
        id: "bob",
        name: "Bob Wilson",
        traitIds: ["cook"],
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
      }
    ];

    const shifts = [
      {
        id: "shift-manager",
        name: "Manager Shift",
        startDateTime: new Date(2024, 0, 15, 9, 0),
        endDateTime: new Date(2024, 0, 15, 17, 0),
        requirements: {
          staffCount: 1,
          requiredTraits: [
            { traitId: "manager", minCount: 1 }
          ]
        },
        assignedStaff: []
      }
    ];

    const weekStart = new Date(2024, 0, 15);
    
    const result = yalpsAutoScheduleWeek(shifts as unknown as ShiftOccurrence[], staff, weekStart, mockTFunction);
    
    console.log('\n=== TRAIT REQUIREMENTS TEST ===');
    console.log('Result success:', result.success);
    console.log('Assignments:', JSON.stringify(result.assignments, null, 2));
    console.log('==============================\n');
    
    expect(result.success).toBe(true);
    
    if (result.success) {
      // Should assign Alice (manager) to the manager shift
      expect(result.assignments["shift-manager"]).toContain("alice");
      expect(result.assignments["shift-manager"]).not.toContain("bob");
    }
  });

  it('should handle incompatible staff', () => {
    const staff = [
      {
        id: "alice",
        name: "Alice Smith",
        traitIds: [],
        constraints: {
          maxShiftsPerDay: 1,
          maxShiftsPerWeek: 5,
          maxShiftsPerMonth: 21,
          maxShiftsPerYear: 250,
          incompatibleWith: ["bob"],
          restDaysWithStaff: [],
          consecutiveRestDays: []
        },
        blockedTimes: []
      },
      {
        id: "bob",
        name: "Bob Wilson",
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
      },
      {
        id: "charlie",
        name: "Charlie Brown",
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
      }
    ];

    const shifts = [
      {
        id: "team-shift",
        name: "Team Shift",
        startDateTime: new Date(2024, 0, 15, 9, 0),
        endDateTime: new Date(2024, 0, 15, 17, 0),
        requirements: {
          staffCount: 2, // Need 2 people
          requiredTraits: []
        },
        assignedStaff: []
      }
    ];

    const weekStart = new Date(2024, 0, 15);
    
    const result = yalpsAutoScheduleWeek(shifts as unknown as ShiftOccurrence[], staff, weekStart, mockTFunction);
    
    console.log('\n=== INCOMPATIBLE STAFF TEST ===');
    console.log('Result success:', result.success);
    console.log('Assignments:', JSON.stringify(result.assignments, null, 2));
    console.log('===============================\n');
    
    expect(result.success).toBe(true);
    
    if (result.success) {
      const teamAssignment = result.assignments["team-shift"];
      expect(teamAssignment.length).toBe(2);
      
      // Alice and Bob should not both be assigned (they're incompatible)
      const hasAlice = teamAssignment.includes("alice");
      const hasBob = teamAssignment.includes("bob");
      expect(hasAlice && hasBob).toBe(false);
    }
  });
});