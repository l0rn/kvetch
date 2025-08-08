import { describe, it, expect } from 'vitest';
import { yalpsAutoScheduleWeek } from '../utils/yalpsScheduler';
import type { ShiftOccurrence } from '../storage/database-pouchdb';

describe('Final YALPS Test', () => {
  it('should solve simple scheduling case', () => {
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
        assignedStaff: []
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
        assignedStaff: []
      }
    ];

    const weekStart = new Date(2024, 0, 15);
    const result = yalpsAutoScheduleWeek(shifts as unknown as ShiftOccurrence[], staff, weekStart, ((key: string) => key) as any);
    
    console.log('\n=== FINAL YALPS TEST ===');
    console.log('Success:', result.success);
    console.log('Errors:', result.errors);
    console.log('Assignments:', JSON.stringify(result.assignments, null, 2));
    console.log('Objective:', result.objective);
    console.log('========================\n');
    
    expect(result.success).toBe(true);
    
    // Each shift should have exactly 1 staff member assigned
    expect(result.assignments['mon-morning']).toHaveLength(1);
    expect(result.assignments['mon-evening']).toHaveLength(1);
    
    // All assigned staff should be valid
    const allAssigned = Object.values(result.assignments).flat();
    for (const staffId of allAssigned) {
      expect(['alice', 'bob']).toContain(staffId);
    }
    
    // Objective should be 2 (2 assignments made)
    expect(result.objective).toBe(2);
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
        id: "manager-shift",
        name: "Manager Shift",
        startDateTime: new Date(2024, 0, 15, 9, 0),
        endDateTime: new Date(2024, 0, 15, 17, 0),
        requirements: {
          staffCount: 1,
          requiredTraits: [{ traitId: "manager", minCount: 1 }]
        },
        assignedStaff: []
      }
    ];

    const weekStart = new Date(2024, 0, 15);
    const result = yalpsAutoScheduleWeek(shifts as unknown as ShiftOccurrence[], staff, weekStart, ((key: string) => key) as any);
    
    console.log('\n=== TRAIT REQUIREMENTS TEST ===');
    console.log('Success:', result.success);
    console.log('Assignments:', JSON.stringify(result.assignments, null, 2));
    console.log('===============================\n');
    
    expect(result.success).toBe(true);
    expect(result.assignments['manager-shift']).toContain('alice');
    expect(result.assignments['manager-shift']).not.toContain('bob');
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
          staffCount: 2,
          requiredTraits: []
        },
        assignedStaff: []
      }
    ];

    const weekStart = new Date(2024, 0, 15);
    const result = yalpsAutoScheduleWeek(shifts as unknown as ShiftOccurrence[], staff, weekStart, ((key: string) => key) as any);
    
    console.log('\n=== INCOMPATIBLE STAFF TEST ===');
    console.log('Success:', result.success);
    console.log('Assignments:', JSON.stringify(result.assignments, null, 2));
    console.log('===============================\n');
    
    expect(result.success).toBe(true);
    
    const teamAssignment = result.assignments['team-shift'];
    expect(teamAssignment).toHaveLength(2);
    
    // Alice and Bob should not both be assigned (they're incompatible)
    const hasAlice = teamAssignment.includes('alice');
    const hasBob = teamAssignment.includes('bob');
    expect(hasAlice && hasBob).toBe(false);
  });
});