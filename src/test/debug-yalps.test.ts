import { describe, it } from 'vitest';
import { yalpsAutoScheduleWeek } from '../utils/yalpsScheduler';

describe('Debug YALPS', () => {
  it('should debug yalps scheduling', () => {
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
      }
    ];

    const weekStart = new Date(2024, 0, 15);
    const result = yalpsAutoScheduleWeek(shifts, staff, weekStart, [], (key) => key, 'en');
    
    console.log('\n=== YALPS DEBUG ===');
    console.log('Success:', result.success);
    console.log('Errors:', result.errors);
    console.log('Assignments:', result.assignments);
    console.log('Objective:', result.objective);
    console.log('==================\n');
    
    if (!result.success) {
      throw new Error(`YALPS failed: ${result.errors.join(', ')}`);
    }
  });
});