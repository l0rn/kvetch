import { addDays, startOfWeek } from 'date-fns';
import type { ShiftOccurrence } from "../../storage/database";

/**
 * Shift occurrence fixtures for testing
 */

// Helper function to create shift occurrence
export function createShift(
  id: string,
  name: string,
  date: Date,
  startHour: number,
  endHour: number,
  staffCount: number,
  requiredTraits: Array<{ traitId: string; minCount: number }> = []
): ShiftOccurrence {
  const startDateTime = new Date(date);
  startDateTime.setHours(startHour, 0, 0, 0);
  
  const endDateTime = new Date(date);
  endDateTime.setHours(endHour, 0, 0, 0);
  
  return {
    id,
    parentShiftId: id + '_parent',
    name,
    startDateTime,
    endDateTime,
    requirements: {
      staffCount,
      requiredTraits
    },
    assignedStaff: [],
    isModified: false,
    isDeleted: false
  };
}

// Base date for consistent testing (Monday January 15, 2024)
export const testWeekStart = startOfWeek(new Date(2024, 0, 15));
export const monday = new Date(2024, 0, 15);
export const tuesday = addDays(monday, 1);
export const wednesday = addDays(monday, 2);
export const thursday = addDays(monday, 3);
export const friday = addDays(monday, 4);
export const saturday = addDays(monday, 5);
export const sunday = addDays(monday, 6);

// Simple single-staff shifts
export const singleStaffShifts = {
  mondayMorning: createShift("mon-morning", "Monday Morning", monday, 9, 17, 1),
  mondayEvening: createShift("mon-evening", "Monday Evening", monday, 17, 21, 1),
  tuesdayMorning: createShift("tue-morning", "Tuesday Morning", tuesday, 9, 17, 1),
  tuesdayEvening: createShift("tue-evening", "Tuesday Evening", tuesday, 17, 21, 1),
  wednesdayMorning: createShift("wed-morning", "Wednesday Morning", wednesday, 9, 17, 1)
};

// Multi-staff shifts
export const multiStaffShifts = {
  mondayTeam: createShift("mon-team", "Monday Team Shift", monday, 9, 17, 2),
  tuesdayTeam: createShift("tue-team", "Tuesday Team Shift", tuesday, 9, 17, 2),
  wednesdayBigTeam: createShift("wed-big-team", "Wednesday Big Team", wednesday, 9, 17, 3)
};

// Shifts with trait requirements
export const traitRequiredShifts = {
  kitchenShift: createShift("kitchen", "Kitchen Shift", monday, 9, 17, 1, 
    [{ traitId: "cook", minCount: 1 }]),
  floorShift: createShift("floor", "Floor Shift", monday, 9, 17, 1,
    [{ traitId: "server", minCount: 1 }]),
  adminShift: createShift("admin", "Admin Shift", monday, 10, 18, 1,
    [{ traitId: "manager", minCount: 1 }]),
  restaurantShift: createShift("restaurant", "Restaurant Shift", monday, 9, 17, 3,
    [
      { traitId: "manager", minCount: 1 },
      { traitId: "cook", minCount: 1 },
      { traitId: "server", minCount: 1 }
    ])
};

// Weekly pattern shifts for constraint testing
export const weeklyShifts = [
  createShift("mon-morning", "Monday Morning", monday, 9, 17, 1),
  createShift("mon-evening", "Monday Evening", monday, 17, 21, 1),
  createShift("tue-morning", "Tuesday Morning", tuesday, 9, 17, 1),
  createShift("tue-evening", "Tuesday Evening", tuesday, 17, 21, 1),
  createShift("wed-morning", "Wednesday Morning", wednesday, 9, 17, 1),
  createShift("thu-morning", "Thursday Morning", thursday, 9, 17, 1),
  createShift("fri-morning", "Friday Morning", friday, 9, 17, 1)
];

// Team shifts for incompatible staff testing
export const teamShifts = {
  team1: createShift("team1", "Team Shift 1", monday, 9, 17, 2),
  team2: createShift("team2", "Team Shift 2", monday, 17, 21, 2),
  team3: createShift("team3", "Team Shift 3", tuesday, 9, 17, 2)
};

// Shifts for blocked time testing
export const blockedTimeShifts = {
  earlyMorning: createShift("early-morning", "Early Morning", monday, 9, 12, 1), // Conflicts with Alice's blocked time
  afternoon: createShift("afternoon", "Afternoon Shift", monday, 13, 17, 1), // Alice available
  evening: createShift("evening", "Evening Shift", monday, 17, 21, 1)
};

// Complex scenario shifts combining multiple constraints
export const complexShifts = [
  createShift("mon-restaurant", "Monday Restaurant", monday, 9, 17, 2,
    [{ traitId: "cook", minCount: 1 }, { traitId: "server", minCount: 1 }]),
  createShift("tue-admin", "Tuesday Admin", tuesday, 10, 16, 1,
    [{ traitId: "manager", minCount: 1 }]),
  createShift("wed-afternoon", "Wednesday Afternoon", wednesday, 15, 19, 1,
    [{ traitId: "server", minCount: 1 }]), // Alice blocked 14-18
  createShift("thu-kitchen", "Thursday Kitchen", thursday, 9, 17, 1,
    [{ traitId: "cook", minCount: 1 }]),
  createShift("fri-mixed", "Friday Mixed", friday, 9, 17, 2,
    [{ traitId: "manager", minCount: 1 }])
];

// Rest day testing shifts - need longer patterns
export const restDayTestShifts = [
  // Week 1 - Monday to Sunday
  createShift("w1-mon", "Week 1 Monday", monday, 9, 17, 1),
  createShift("w1-tue", "Week 1 Tuesday", tuesday, 9, 17, 1),
  createShift("w1-wed", "Week 1 Wednesday", wednesday, 9, 17, 1),
  createShift("w1-thu", "Week 1 Thursday", thursday, 9, 17, 1),
  createShift("w1-fri", "Week 1 Friday", friday, 9, 17, 1),
  createShift("w1-sat", "Week 1 Saturday", saturday, 9, 17, 1),
  createShift("w1-sun", "Week 1 Sunday", sunday, 9, 17, 1)
];