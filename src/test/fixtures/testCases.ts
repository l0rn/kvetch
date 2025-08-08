import type { StaffMember, ShiftOccurrence, Trait } from '../../storage/database-pouchdb';
import * as staffFixtures from './staff';
import * as shiftFixtures from './shifts';

/**
 * Complete test case fixtures combining staff, shifts, and expected solutions
 */

export interface TestCase {
  name: string;
  description: string;
  staff: StaffMember[];
  shifts: ShiftOccurrence[];
  traits: Trait[];
  expectedSolution: { [shiftId: string]: string[] }; // shiftId -> staff IDs
  weekStart: Date;
  shouldSucceed: boolean;
}

export const simpleTestCases: TestCase[] = [
  {
    name: "Simple Assignment",
    description: "Two staff members, two shifts requiring 1 person each",
    staff: [staffFixtures.basicStaff.alice, staffFixtures.basicStaff.bob],
    shifts: [shiftFixtures.singleStaffShifts.mondayMorning, shiftFixtures.singleStaffShifts.mondayEvening],
    traits: [],
    expectedSolution: {
      "mon-morning": ["alice"],
      "mon-evening": ["bob"]
    },
    weekStart: shiftFixtures.testWeekStart,
    shouldSucceed: true
  },

  {
    name: "Multi-Position Shift",
    description: "Two staff members, one shift requiring 2 people",
    staff: [staffFixtures.basicStaff.alice, staffFixtures.basicStaff.bob],
    shifts: [shiftFixtures.multiStaffShifts.mondayTeam],
    traits: [],
    expectedSolution: {
      "mon-team": ["alice", "bob"]
    },
    weekStart: shiftFixtures.testWeekStart,
    shouldSucceed: true
  }
];

export const traitTestCases: TestCase[] = [
  {
    name: "Basic Trait Requirements",
    description: "Three staff with different skills, shifts requiring specific traits",
    staff: [
      staffFixtures.skilledStaff.aliceManager,
      staffFixtures.skilledStaff.bobCook,
      staffFixtures.skilledStaff.charlieServer
    ],
    shifts: [
      shiftFixtures.traitRequiredShifts.kitchenShift,
      shiftFixtures.traitRequiredShifts.floorShift,
      shiftFixtures.traitRequiredShifts.adminShift
    ],
    traits: staffFixtures.traits,
    expectedSolution: {
      "kitchen": ["bob"],
      "floor": ["charlie"],
      "admin": ["alice"]
    },
    weekStart: shiftFixtures.testWeekStart,
    shouldSucceed: true
  },

  {
    name: "Mixed Trait Requirements",
    description: "Shift requiring multiple people with different traits",
    staff: [
      staffFixtures.skilledStaff.aliceManager,
      staffFixtures.skilledStaff.bobCook,
      staffFixtures.skilledStaff.charlieServer,
      staffFixtures.skilledStaff.dianaAllRounder
    ],
    shifts: [shiftFixtures.traitRequiredShifts.restaurantShift],
    traits: staffFixtures.traits,
    expectedSolution: {
      "restaurant": ["alice", "bob", "charlie"] // Alice=manager+server, Bob=cook, Charlie=server
    },
    weekStart: shiftFixtures.testWeekStart,
    shouldSucceed: true
  }
];

export const constraintTestCases: TestCase[] = [
  {
    name: "Weekly Constraints",
    description: "Staff with weekly limits across multiple shifts",
    staff: [
      staffFixtures.constrainedStaff.alice2Shifts,
      staffFixtures.constrainedStaff.bob3Shifts,
      staffFixtures.constrainedStaff.charlie2Shifts
    ],
    shifts: [
      shiftFixtures.singleStaffShifts.mondayMorning,
      shiftFixtures.singleStaffShifts.mondayEvening,
      shiftFixtures.singleStaffShifts.tuesdayMorning,
      shiftFixtures.singleStaffShifts.tuesdayEvening,
      shiftFixtures.singleStaffShifts.wednesdayMorning
    ],
    traits: [],
    expectedSolution: {
      "mon-morning": ["alice"],
      "mon-evening": ["bob"],
      "tue-morning": ["charlie"],
      "tue-evening": ["bob"],
      "wed-morning": ["alice"] // Alice: 2 shifts, Bob: 2 shifts, Charlie: 1 shift
    },
    weekStart: shiftFixtures.testWeekStart,
    shouldSucceed: true
  },

  {
    name: "Incompatible Staff",
    description: "Staff members who cannot work together",
    staff: [
      staffFixtures.incompatibleStaff.aliceHatesBob,
      staffFixtures.incompatibleStaff.bobHatesAlice,
      staffFixtures.incompatibleStaff.charlie,
      staffFixtures.incompatibleStaff.diana
    ],
    shifts: [
      shiftFixtures.teamShifts.team1,
      shiftFixtures.teamShifts.team2
    ],
    traits: [],
    expectedSolution: {
      "team1": ["alice", "charlie"], // Alice cannot be with Bob
      "team2": ["bob", "diana"]      // Bob cannot be with Alice
    },
    weekStart: shiftFixtures.testWeekStart,
    shouldSucceed: true
  },

  {
    name: "Blocked Times",
    description: "Staff with blocked times preventing certain assignments",
    staff: [
      staffFixtures.staffWithBlockedTimes.aliceBlocked,
      staffFixtures.staffWithBlockedTimes.bob,
      staffFixtures.staffWithBlockedTimes.charlie
    ],
    shifts: [
      shiftFixtures.blockedTimeShifts.earlyMorning, // Conflicts with Alice's blocked time
      shiftFixtures.blockedTimeShifts.afternoon,   // Alice available
      shiftFixtures.blockedTimeShifts.evening
    ],
    traits: [],
    expectedSolution: {
      "early-morning": ["bob"],      // Alice blocked, so Bob takes morning
      "afternoon": ["alice"],        // Alice available for afternoon
      "evening": ["charlie"]         // Charlie takes evening
    },
    weekStart: shiftFixtures.testWeekStart,
    shouldSucceed: true
  }
];

export const restDayTestCases: TestCase[] = [
  {
    name: "Rest Days With Specific Staff",
    description: "Alice needs rest days with Bob - they should have some days off together",
    staff: [
      staffFixtures.staffWithRestDays.aliceNeedsRestWithBob,
      staffFixtures.staffWithRestDays.bob,
      staffFixtures.staffWithRestDays.diana
    ],
    shifts: shiftFixtures.restDayTestShifts.slice(0, 5), // Mon-Fri only
    traits: [],
    expectedSolution: {
      // Possible solution: Alice and Bob both rest on one day, Diana covers
      "w1-mon": ["alice"],
      "w1-tue": ["bob"],
      "w1-wed": ["diana"], // Alice and Bob both rest together
      "w1-thu": ["alice"],
      "w1-fri": ["bob"]
    },
    weekStart: shiftFixtures.testWeekStart,
    shouldSucceed: true
  },

  {
    name: "Consecutive Rest Days",
    description: "Charlie needs 2 consecutive rest days per week",
    staff: [
      staffFixtures.staffWithRestDays.charlieNeedsConsecutiveRest,
      staffFixtures.staffWithRestDays.aliceNeedsRestWithBob,
      staffFixtures.staffWithRestDays.bob,
      staffFixtures.staffWithRestDays.diana
    ],
    shifts: shiftFixtures.restDayTestShifts, // Full week
    traits: [],
    expectedSolution: {
      // Charlie gets consecutive rest on Tue-Wed
      "w1-mon": ["alice"],
      // "w1-tue": [], // Charlie rests
      // "w1-wed": [], // Charlie rests (consecutive)
      "w1-thu": ["charlie"],
      "w1-fri": ["alice"],
      "w1-sat": ["bob"],
      "w1-sun": ["diana"]
    },
    weekStart: shiftFixtures.testWeekStart,
    shouldSucceed: true
  }
];

export const complexTestCases: TestCase[] = [
  {
    name: "Complex Mixed Constraints",
    description: "Combination of traits, weekly limits, incompatibility, and blocked times",
    staff: [
      staffFixtures.complexStaff.aliceManager,
      staffFixtures.complexStaff.bobCook,
      staffFixtures.complexStaff.charlieServer,
      staffFixtures.complexStaff.dianaAllRounder
    ],
    shifts: shiftFixtures.complexShifts,
    traits: staffFixtures.traits,
    expectedSolution: {
      "mon-restaurant": ["bob", "charlie"],    // Bob=cook, Charlie=server (Alice can't work with Bob)
      "tue-admin": ["alice"],                  // Alice=manager
      "wed-afternoon": ["diana"],              // Diana=server (Alice blocked 14-18)
      "thu-kitchen": ["diana"],                // Diana=cook (Bob already has 2 shifts)
      "fri-mixed": ["alice"]                   // Alice=manager (2nd shift for Alice)
    },
    weekStart: shiftFixtures.testWeekStart,
    shouldSucceed: true
  }
];

// Impossible test cases (should fail)
export const impossibleTestCases: TestCase[] = [
  {
    name: "Impossible - Not Enough Staff",
    description: "More positions required than available staff",
    staff: [staffFixtures.basicStaff.alice],
    shifts: [shiftFixtures.multiStaffShifts.mondayTeam], // Needs 2 people, only have 1
    traits: [],
    expectedSolution: {},
    weekStart: shiftFixtures.testWeekStart,
    shouldSucceed: false
  },

  {
    name: "Impossible - Missing Required Skills",
    description: "Shift requires skills that no staff member has",
    staff: [
      staffFixtures.skilledStaff.aliceManager, // Only has manager skill
      staffFixtures.skilledStaff.charlieServer // Only has server skill
    ],
    shifts: [shiftFixtures.traitRequiredShifts.kitchenShift], // Needs cook skill
    traits: staffFixtures.traits,
    expectedSolution: {},
    weekStart: shiftFixtures.testWeekStart,
    shouldSucceed: false
  }
];

// All test cases grouped
export const allTestCases = [
  ...simpleTestCases,
  ...traitTestCases,
  ...constraintTestCases,
  ...restDayTestCases,
  ...complexTestCases,
  ...impossibleTestCases
];