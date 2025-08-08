import type { StaffMember, Trait } from '../../storage/database-pouchdb';

/**
 * Staff member fixtures for testing
 */

export const traits: Trait[] = [
  { id: "manager", name: "Manager", description: "Management skills", createdAt: new Date().toISOString() },
  { id: "cook", name: "Cook", description: "Cooking skills", createdAt: new Date().toISOString() },
  { id: "server", name: "Server", description: "Serving skills", createdAt: new Date().toISOString() },
  { id: "cashier", name: "Cashier", description: "Cash handling skills", createdAt: new Date().toISOString() },
  { id: "cleaner", name: "Cleaner", description: "Cleaning skills", createdAt: new Date().toISOString() },
];

// Helper function to create staff member
export function createStaff(
  id: string, 
  name: string, 
  traitIds: string[] = [],
  constraints?: Partial<StaffMember['constraints']>,
  incompatibleWith: string[] = [],
  blockedTimes: StaffMember['blockedTimes'] = []
): StaffMember {
  return {
    id,
    name,
    traitIds,
    constraints: {
      maxShiftsPerDay: constraints?.maxShiftsPerDay || 1,
      maxShiftsPerWeek: constraints?.maxShiftsPerWeek || 5,
      maxShiftsPerMonth: constraints?.maxShiftsPerMonth || 21,
      maxShiftsPerYear: constraints?.maxShiftsPerYear || 250,
      incompatibleWith: incompatibleWith,
      restDaysWithStaff: constraints?.restDaysWithStaff || [],
      consecutiveRestDays: constraints?.consecutiveRestDays || []
    },
    blockedTimes
  };
}

// Basic staff members
export const basicStaff = {
  alice: createStaff("alice", "Alice Smith"),
  bob: createStaff("bob", "Bob Wilson"),
  charlie: createStaff("charlie", "Charlie Brown"),
  diana: createStaff("diana", "Diana Prince")
};

// Staff with traits
export const skilledStaff = {
  aliceManager: createStaff("alice", "Alice Smith", ["manager"]),
  bobCook: createStaff("bob", "Bob Wilson", ["cook"]),
  charlieServer: createStaff("charlie", "Charlie Brown", ["server"]),
  dianaAllRounder: createStaff("diana", "Diana Prince", ["manager", "server", "cook"])
};

// Staff with weekly constraints
export const constrainedStaff = {
  alice2Shifts: createStaff("alice", "Alice Smith", [], { maxShiftsPerWeek: 2 }),
  bob3Shifts: createStaff("bob", "Bob Wilson", [], { maxShiftsPerWeek: 3 }),
  charlie2Shifts: createStaff("charlie", "Charlie Brown", [], { maxShiftsPerWeek: 2 })
};

// Incompatible staff
export const incompatibleStaff = {
  aliceHatesBob: createStaff("alice", "Alice Smith", [], undefined, ["bob"]),
  bobHatesAlice: createStaff("bob", "Bob Wilson", [], undefined, ["alice"]),
  charlie: createStaff("charlie", "Charlie Brown"),
  diana: createStaff("diana", "Diana Prince")
};

// Staff with blocked times
export const staffWithBlockedTimes = {
  aliceBlocked: createStaff("alice", "Alice Smith", [], undefined, [], [
    {
      id: "alice-blocked-1",
      startDateTime: new Date(2024, 0, 15, 8, 0), // Monday 8-12 blocked
      endDateTime: new Date(2024, 0, 15, 12, 0),
      isFullDay: false
    }
  ]),
  bob: createStaff("bob", "Bob Wilson"),
  charlie: createStaff("charlie", "Charlie Brown")
};

// Staff with rest day constraints
export const staffWithRestDays = {
  aliceNeedsRestWithBob: createStaff("alice", "Alice Smith", [], {
    restDaysWithStaff: [
      { staffId: "bob", minRestDays: 1, period: 'week' }
    ]
  }, [], []),
  bob: createStaff("bob", "Bob Wilson", [], undefined, [], []),
  charlieNeedsConsecutiveRest: createStaff("charlie", "Charlie Brown", [], {
    consecutiveRestDays: [
      { minConsecutiveDays: 2, period: 'week' }
    ]
  }, [], []),
  diana: createStaff("diana", "Diana Prince", [], undefined, [], [])
};

// Complex staff with multiple constraints
export const complexStaff = {
  aliceManager: createStaff("alice", "Alice Manager", ["manager"], 
    { 
      maxShiftsPerWeek: 2,
      restDaysWithStaff: [{ staffId: "bob", minRestDays: 1, period: 'week' }]
    }, 
    ["bob"], 
    [{
      id: "alice-blocked-complex",
      startDateTime: new Date(2024, 0, 17, 14, 0), // Wednesday 14-18 blocked
      endDateTime: new Date(2024, 0, 17, 18, 0),
      isFullDay: false
    }]
  ),
  bobCook: createStaff("bob", "Bob Cook", ["cook"], { maxShiftsPerWeek: 3 }, ["alice"]),
  charlieServer: createStaff("charlie", "Charlie Server", ["server"], 
    { 
      maxShiftsPerWeek: 2,
      consecutiveRestDays: [{ minConsecutiveDays: 2, period: 'week' }]
    }
  ),
  dianaAllRounder: createStaff("diana", "Diana AllRounder", ["manager", "server", "cook"], { maxShiftsPerWeek: 4 })
};