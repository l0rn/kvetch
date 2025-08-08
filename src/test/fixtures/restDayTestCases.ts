import { addDays } from 'date-fns';
import type { TestCase } from './testCases';
import * as staffFixtures from './staff';
import * as shiftFixtures from './shifts';

/**
 * Extended rest day constraint test cases
 */

// Helper to create staff with rest day constraints
function createStaffWithRestConstraints(
  id: string,
  name: string,
  traitIds: string[] = [],
  restDaysWithStaff?: Array<{ staffId: string; minRestDays: number; period: 'week' | 'month' }>,
  consecutiveRestDays?: Array<{ minConsecutiveDays: number; period: 'week' | 'month' }>,
  maxShiftsPerWeek: number = 5
) {
  return staffFixtures.createStaff(id, name, traitIds, {
    maxShiftsPerWeek,
    restDaysWithStaff,
    consecutiveRestDays
  }, [], []); // Empty incompatibleWith and blockedTimes
}

// Helper to create daily shifts for a full week
function createWeeklyShifts(weekStart: Date, shiftName: string = 'Daily', startHour: number = 9, endHour: number = 17) {
  const shifts = [];
  for (let day = 0; day < 7; day++) {
    const date = addDays(weekStart, day);
    const dayName = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][day];
    shifts.push(shiftFixtures.createShift(
      `${dayName.toLowerCase()}-shift`,
      `${dayName} ${shiftName}`,
      date,
      startHour,
      endHour,
      1
    ));
  }
  return shifts;
}

export const restDaysWithStaffTestCases: TestCase[] = [
  {
    name: "Rest Days With Specific Staff - Simple",
    description: "Alice needs 1 rest day per week with Bob",
    staff: [
      createStaffWithRestConstraints("alice", "Alice", [], [
        { staffId: "bob", minRestDays: 1, period: 'week' }
      ], [], 4), // Can work max 4 days
      createStaffWithRestConstraints("bob", "Bob", [], [], [], 4),
      createStaffWithRestConstraints("charlie", "Charlie", [], [], [], 7)
    ],
    shifts: createWeeklyShifts(shiftFixtures.testWeekStart).slice(0, 6), // Mon-Sat
    traits: [],
    expectedSolution: {
      // Alice and Bob should both be off on at least one day
      // Charlie can cover when both are off
      "mon-shift": ["alice"],
      "tue-shift": ["bob"],
      "wed-shift": ["charlie"], // Alice and Bob both rest
      "thu-shift": ["alice"],
      "fri-shift": ["bob"],
      "sat-shift": ["alice"]
    },
    weekStart: shiftFixtures.testWeekStart,
    shouldSucceed: true
  },

  {
    name: "Rest Days With Specific Staff - Multiple",
    description: "Alice needs rest days with Bob AND Charlie",
    staff: [
      createStaffWithRestConstraints("alice", "Alice", [], [
        { staffId: "bob", minRestDays: 1, period: 'week' },
        { staffId: "charlie", minRestDays: 1, period: 'week' }
      ], [], 3), // Can work max 3 days
      createStaffWithRestConstraints("bob", "Bob", [], [], [], 4),
      createStaffWithRestConstraints("charlie", "Charlie", [], [], [], 4),
      createStaffWithRestConstraints("diana", "Diana", [], [], [], 7)
    ],
    shifts: createWeeklyShifts(shiftFixtures.testWeekStart), // Full week
    traits: [],
    expectedSolution: {
      // Alice needs to rest with Bob on one day, and with Charlie on another day
      // Diana can cover when others are off
      "sun-shift": ["diana"], // Alice, Bob, Charlie all rest
      "mon-shift": ["alice"],
      "tue-shift": ["diana"], // Alice and Bob rest together
      "wed-shift": ["bob"],
      "thu-shift": ["diana"], // Alice and Charlie rest together  
      "fri-shift": ["alice"],
      "sat-shift": ["charlie"]
    },
    weekStart: shiftFixtures.testWeekStart,
    shouldSucceed: true
  },

  {
    name: "Rest Days With Staff - Bidirectional",
    description: "Alice and Bob both need rest days with each other",
    staff: [
      createStaffWithRestConstraints("alice", "Alice", [], [
        { staffId: "bob", minRestDays: 2, period: 'week' }
      ], [], 3),
      createStaffWithRestConstraints("bob", "Bob", [], [
        { staffId: "alice", minRestDays: 2, period: 'week' }
      ], [], 3),
      createStaffWithRestConstraints("charlie", "Charlie", [], [], [], 7)
    ],
    shifts: createWeeklyShifts(shiftFixtures.testWeekStart), // Full week
    traits: [],
    expectedSolution: {
      // Alice and Bob need 2 rest days together per week
      "sun-shift": ["charlie"], // Both rest
      "mon-shift": ["alice"],
      "tue-shift": ["bob"],
      "wed-shift": ["charlie"], // Both rest
      "thu-shift": ["alice"], 
      "fri-shift": ["bob"],
      "sat-shift": ["charlie"]
    },
    weekStart: shiftFixtures.testWeekStart,
    shouldSucceed: true
  },

  {
    name: "Rest Days With Staff - Impossible",
    description: "Too many rest day requirements with limited coverage",
    staff: [
      createStaffWithRestConstraints("alice", "Alice", [], [
        { staffId: "bob", minRestDays: 5, period: 'week' } // Needs 5 days off with Bob
      ], [], 2),
      createStaffWithRestConstraints("bob", "Bob", [], [], [], 2)
      // No other staff to cover
    ],
    shifts: createWeeklyShifts(shiftFixtures.testWeekStart), // 7 shifts, impossible to satisfy
    traits: [],
    expectedSolution: {},
    weekStart: shiftFixtures.testWeekStart,
    shouldSucceed: false
  }
];

export const consecutiveRestDaysTestCases: TestCase[] = [
  {
    name: "Consecutive Rest Days - 2 Days",
    description: "Charlie needs 2 consecutive rest days per week",
    staff: [
      createStaffWithRestConstraints("alice", "Alice", [], [], [], 7),
      createStaffWithRestConstraints("bob", "Bob", [], [], [], 7),
      createStaffWithRestConstraints("charlie", "Charlie", [], [], [
        { minConsecutiveDays: 2, period: 'week' }
      ], 5) // Max 5 days work, needs 2 consecutive rest
    ],
    shifts: createWeeklyShifts(shiftFixtures.testWeekStart),
    traits: [],
    expectedSolution: {
      "sun-shift": ["charlie"],
      "mon-shift": ["alice"], // Charlie rests
      "tue-shift": ["bob"],   // Charlie rests (consecutive)
      "wed-shift": ["charlie"],
      "thu-shift": ["alice"], 
      "fri-shift": ["charlie"],
      "sat-shift": ["bob"]
    },
    weekStart: shiftFixtures.testWeekStart,
    shouldSucceed: true
  },

  {
    name: "Consecutive Rest Days - 3 Days",
    description: "Alice needs 3 consecutive rest days per week",
    staff: [
      createStaffWithRestConstraints("alice", "Alice", [], [], [
        { minConsecutiveDays: 3, period: 'week' }
      ], 4), // Max 4 days work, needs 3 consecutive rest
      createStaffWithRestConstraints("bob", "Bob", [], [], [], 7),
      createStaffWithRestConstraints("charlie", "Charlie", [], [], [], 7)
    ],
    shifts: createWeeklyShifts(shiftFixtures.testWeekStart),
    traits: [],
    expectedSolution: {
      "sun-shift": ["alice"],
      "mon-shift": ["bob"],     // Alice rests
      "tue-shift": ["charlie"], // Alice rests
      "wed-shift": ["bob"],     // Alice rests (3 consecutive days)
      "thu-shift": ["alice"],
      "fri-shift": ["charlie"],
      "sat-shift": ["alice"]
    },
    weekStart: shiftFixtures.testWeekStart,
    shouldSucceed: true
  },

  {
    name: "Multiple Consecutive Rest Days",
    description: "Both Alice and Bob need consecutive rest days",
    staff: [
      createStaffWithRestConstraints("alice", "Alice", [], [], [
        { minConsecutiveDays: 2, period: 'week' }
      ], 5),
      createStaffWithRestConstraints("bob", "Bob", [], [], [
        { minConsecutiveDays: 2, period: 'week' }
      ], 5),
      createStaffWithRestConstraints("charlie", "Charlie", [], [], [], 7),
      createStaffWithRestConstraints("diana", "Diana", [], [], [], 7)
    ],
    shifts: createWeeklyShifts(shiftFixtures.testWeekStart),
    traits: [],
    expectedSolution: {
      "sun-shift": ["alice"],
      "mon-shift": ["charlie"], // Alice rests
      "tue-shift": ["diana"],   // Alice rests (consecutive)
      "wed-shift": ["bob"],     
      "thu-shift": ["charlie"], // Bob rests
      "fri-shift": ["diana"],   // Bob rests (consecutive)
      "sat-shift": ["alice"]
    },
    weekStart: shiftFixtures.testWeekStart,
    shouldSucceed: true
  },

  {
    name: "Consecutive Rest Days - Weekend Pattern",
    description: "Staff prefers consecutive rest days on weekends",
    staff: [
      createStaffWithRestConstraints("alice", "Alice", [], [], [
        { minConsecutiveDays: 2, period: 'week' }
      ], 5),
      createStaffWithRestConstraints("bob", "Bob", [], [], [], 7)
    ],
    shifts: createWeeklyShifts(shiftFixtures.testWeekStart),
    traits: [],
    expectedSolution: {
      "sun-shift": ["bob"],   // Alice rests (start of weekend)
      "mon-shift": ["bob"],   // Alice rests (consecutive weekend)
      "tue-shift": ["alice"],
      "wed-shift": ["alice"],
      "thu-shift": ["alice"],
      "fri-shift": ["alice"],
      "sat-shift": ["alice"]
    },
    weekStart: shiftFixtures.testWeekStart,
    shouldSucceed: true
  }
];

export const combinedRestDayTestCases: TestCase[] = [
  {
    name: "Combined Rest Constraints - Complex",
    description: "Mix of rest days with staff and consecutive rest days",
    staff: [
      createStaffWithRestConstraints("alice", "Alice", [], [
        { staffId: "bob", minRestDays: 1, period: 'week' }
      ], [
        { minConsecutiveDays: 2, period: 'week' }
      ], 4),
      createStaffWithRestConstraints("bob", "Bob", [], [], [
        { minConsecutiveDays: 2, period: 'week' }
      ], 5),
      createStaffWithRestConstraints("charlie", "Charlie", [], [], [], 7),
      createStaffWithRestConstraints("diana", "Diana", [], [], [], 7)
    ],
    shifts: createWeeklyShifts(shiftFixtures.testWeekStart),
    traits: [],
    expectedSolution: {
      // Alice needs: rest with Bob (1 day) + consecutive rest (2 days)
      // Bob needs: consecutive rest (2 days)
      // This is complex and may have multiple valid solutions
      "sun-shift": ["charlie"], // Alice and Bob both rest (consecutive for both)
      "mon-shift": ["diana"],   // Alice and Bob both rest (consecutive continues)
      "tue-shift": ["alice"],
      "wed-shift": ["bob"],
      "thu-shift": ["charlie"],
      "fri-shift": ["alice"],
      "sat-shift": ["diana"]
    },
    weekStart: shiftFixtures.testWeekStart,
    shouldSucceed: true
  }
];

// All rest day test cases combined
export const allRestDayTestCases = [
  ...restDaysWithStaffTestCases,
  ...consecutiveRestDaysTestCases,
  ...combinedRestDayTestCases
];