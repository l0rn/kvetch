import { describe, it, expect } from 'vitest';
import { yalpsAutoScheduleWeek } from '../utils/yalpsScheduler';
import type { ShiftOccurrence } from "../storage/database";
import type { TFunction } from 'i18next';

describe('YALPS Monthly and Yearly Limits', () => {
  it('should respect monthly shift limits', () => {
    const staff = [
      {
        id: "alice",
        name: "Alice Smith",
        traitIds: [],
        constraints: {
          maxShiftsPerDay: 3,
          maxShiftsPerWeek: 15,
          maxShiftsPerMonth: 2, // Very low monthly limit
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
          maxShiftsPerDay: 3,
          maxShiftsPerWeek: 15,
          maxShiftsPerMonth: 20,
          maxShiftsPerYear: 250,
          incompatibleWith: [],
          restDaysWithStaff: [],
          consecutiveRestDays: []
        },
        blockedTimes: []
      }
    ];

    // Create existing assignments for Alice in the same month (January 2024)
    const existingAssignments = [
      {
        id: "existing-1",
        name: "Existing Shift 1",
        startDateTime: new Date(2024, 0, 10, 9, 0), // Jan 10, different week
        endDateTime: new Date(2024, 0, 10, 13, 0),
        requirements: { staffCount: 1, requiredTraits: [] },
        assignedStaff: ["alice"] // Alice already assigned
      }
    ];

    // Create new shifts in current week (Jan 15) - same month
    const newShifts = [
      {
        id: "new-1",
        name: "New Shift 1", 
        startDateTime: new Date(2024, 0, 15, 9, 0), // Jan 15
        endDateTime: new Date(2024, 0, 15, 13, 0),
        requirements: { staffCount: 1, requiredTraits: [] },
        assignedStaff: []
      },
      {
        id: "new-2", 
        name: "New Shift 2",
        startDateTime: new Date(2024, 0, 15, 14, 0), // Jan 15
        endDateTime: new Date(2024, 0, 15, 18, 0), 
        requirements: { staffCount: 1, requiredTraits: [] },
        assignedStaff: []
      },
      {
        id: "new-3",
        name: "New Shift 3",
        startDateTime: new Date(2024, 0, 16, 9, 0), // Jan 16
        endDateTime: new Date(2024, 0, 16, 13, 0),
        requirements: { staffCount: 1, requiredTraits: [] },
        assignedStaff: []
      }
    ];

    const allShifts = [...existingAssignments, ...newShifts];
    const weekStart = new Date(2024, 0, 15); // Week of Jan 15

    const result = yalpsAutoScheduleWeek(allShifts as unknown as ShiftOccurrence[], staff, weekStart, ((key: string) => key) as unknown as TFunction);
    
    console.log('Monthly limit test result:', result);
    
    expect(result.success).toBe(true);
    
    // Alice has maxShiftsPerMonth = 2, already has 1 existing assignment
    // So she should be assigned to at most 1 more shift in this week
    const aliceAssignments = Object.values(result.assignments).filter(staffList => 
      staffList.includes('alice')
    ).length;
    
    expect(aliceAssignments).toBeLessThanOrEqual(1);
  });

  it('should respect yearly shift limits', () => {
    const staff = [
      {
        id: "bob",
        name: "Bob Wilson",
        traitIds: [],
        constraints: {
          maxShiftsPerDay: 3,
          maxShiftsPerWeek: 15, 
          maxShiftsPerMonth: 50,
          maxShiftsPerYear: 2, // Very low yearly limit
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
          maxShiftsPerDay: 3,
          maxShiftsPerWeek: 15,
          maxShiftsPerMonth: 50,
          maxShiftsPerYear: 250,
          incompatibleWith: [],
          restDaysWithStaff: [],
          consecutiveRestDays: []
        },
        blockedTimes: []
      }
    ];

    // Create existing assignment for Bob in the same year (2024) but different month
    const existingAssignments = [
      {
        id: "existing-yearly",
        name: "Existing Year Shift",
        startDateTime: new Date(2024, 5, 15, 9, 0), // June 2024, different month
        endDateTime: new Date(2024, 5, 15, 13, 0),
        requirements: { staffCount: 1, requiredTraits: [] },
        assignedStaff: ["bob"] // Bob already assigned
      }
    ];

    // Create new shifts in January 2024 (same year, different month)
    const newShifts = [
      {
        id: "new-jan-1",
        name: "New January Shift 1",
        startDateTime: new Date(2024, 0, 15, 9, 0), // Jan 15
        endDateTime: new Date(2024, 0, 15, 13, 0),
        requirements: { staffCount: 1, requiredTraits: [] },
        assignedStaff: []
      },
      {
        id: "new-jan-2",
        name: "New January Shift 2", 
        startDateTime: new Date(2024, 0, 16, 9, 0), // Jan 16
        endDateTime: new Date(2024, 0, 16, 13, 0),
        requirements: { staffCount: 1, requiredTraits: [] },
        assignedStaff: []
      }
    ];

    const allShifts = [...existingAssignments, ...newShifts];
    const weekStart = new Date(2024, 0, 15); // Week of Jan 15

    const result = yalpsAutoScheduleWeek(allShifts as unknown as ShiftOccurrence[], staff, weekStart, ((key: string) => key) as unknown as TFunction);

    console.log('Yearly limit test result:', result);
    
    expect(result.success).toBe(true);
    
    // Bob has maxShiftsPerYear = 2, already has 1 existing assignment
    // So he should be assigned to at most 1 more shift total
    const bobAssignments = Object.values(result.assignments).filter(staffList => 
      staffList.includes('bob')
    ).length;
    
    expect(bobAssignments).toBeLessThanOrEqual(1);
  });
});