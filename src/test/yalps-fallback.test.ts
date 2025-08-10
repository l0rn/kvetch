import { describe, it, expect } from 'vitest';
import { yalpsAutoScheduleWeek } from '../utils/yalpsScheduler';
import type { ShiftOccurrence } from "../storage/database";
import type { TFunction } from 'i18next';

// Mock TFunction for tests
const mockTFunction: TFunction = ((key: string) => key) as TFunction;

describe('YALPS Fallback Scheduling', () => {
  it('should use fallback scheduling when constraints are impossible', () => {
    // Create an impossible scenario: 1 staff member with very restrictive constraints 
    // needs to cover 7 shifts that require 2 people each
    const staff = [
      {
        id: "alice",
        name: "Alice Smith",
        traitIds: [],
        constraints: {
          maxShiftsPerDay: 1,
          maxShiftsPerWeek: 3, // Allow reasonable shifts
          maxShiftsPerMonth: 21,
          maxShiftsPerYear: 250,
          incompatibleWith: [],
          restDaysWithStaff: [],
          consecutiveRestDays: []
        },
        blockedTimes: []
      }
    ];

    // Create shifts that each need 2 people (impossible with only 1 staff member)
    const shifts = [
      {
        id: "shift-day-0",
        name: "Shift Day 0",
        startDateTime: new Date(2024, 0, 15, 9, 0),
        endDateTime: new Date(2024, 0, 15, 17, 0),
        requirements: {
          staffCount: 2, // Impossible with only 1 staff member
          requiredTraits: []
        },
        assignedStaff: []
      },
      {
        id: "shift-day-1",
        name: "Shift Day 1", 
        startDateTime: new Date(2024, 0, 16, 9, 0),
        endDateTime: new Date(2024, 0, 16, 17, 0),
        requirements: {
          staffCount: 2, // Impossible with only 1 staff member  
          requiredTraits: []
        },
        assignedStaff: []
      }
    ];

    const weekStart = new Date(2024, 0, 15);
    const result = yalpsAutoScheduleWeek(shifts as unknown as ShiftOccurrence[], staff, weekStart, mockTFunction);
    
    console.log('\n=== FALLBACK SCHEDULING TEST ===');
    console.log('Success:', result.success);
    console.log('Algorithm:', result.algorithm);
    console.log('Warnings:', result.warnings);
    console.log('Assignments:', JSON.stringify(result.assignments, null, 2));
    console.log('================================\n');
    
    // Should trigger fallback due to impossible constraints
    expect(result.algorithm).toBe('yalps-fallback');
    expect(result.warnings.length).toBeGreaterThan(0);
    
    // Should still be marked as "success" with warnings
    expect(result.success).toBe(true);
    
    // Should have warning about partial solution
    const hasPartialSolutionWarning = result.warnings.some(warning => 
      warning.includes('could not be satisfied') || 
      warning.includes('could not be filled') ||
      warning.includes('partialSolutionWarning') ||
      warning.includes('understaffed')
    );
    expect(hasPartialSolutionWarning).toBe(true);
  });

  it('should fill what it can when some shifts are impossible', () => {
    const staff = [
      {
        id: "alice",
        name: "Alice Smith",
        traitIds: ["cook"],
        constraints: {
          maxShiftsPerDay: 1,
          maxShiftsPerWeek: 3, // Can work 3 shifts per week
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
        traitIds: ["server"],
        constraints: {
          maxShiftsPerDay: 1,
          maxShiftsPerWeek: 2, // Can work 2 shifts per week
          maxShiftsPerMonth: 21,
          maxShiftsPerYear: 250,
          incompatibleWith: [],
          restDaysWithStaff: [],
          consecutiveRestDays: []
        },
        blockedTimes: []
      }
    ];

    // Create shifts - some possible, some impossible due to trait requirements
    const shifts = [
      // These should be fillable
      {
        id: "cook-shift-1",
        name: "Cook Shift 1",
        startDateTime: new Date(2024, 0, 15, 9, 0),
        endDateTime: new Date(2024, 0, 15, 17, 0),
        requirements: {
          staffCount: 1,
          requiredTraits: [{ traitId: "cook", minCount: 1 }]
        },
        assignedStaff: []
      },
      {
        id: "server-shift-1",
        name: "Server Shift 1",
        startDateTime: new Date(2024, 0, 16, 9, 0),
        endDateTime: new Date(2024, 0, 16, 17, 0),
        requirements: {
          staffCount: 1,
          requiredTraits: [{ traitId: "server", minCount: 1 }]
        },
        assignedStaff: []
      },
      // This should be impossible - needs manager trait that nobody has
      {
        id: "manager-shift-impossible",
        name: "Manager Shift (Impossible)",
        startDateTime: new Date(2024, 0, 17, 9, 0),
        endDateTime: new Date(2024, 0, 17, 17, 0),
        requirements: {
          staffCount: 1,
          requiredTraits: [{ traitId: "manager", minCount: 1 }] // Nobody has this trait
        },
        assignedStaff: []
      }
    ];

    const weekStart = new Date(2024, 0, 15);
    const result = yalpsAutoScheduleWeek(shifts as unknown as ShiftOccurrence[], staff, weekStart, mockTFunction);
    
    console.log('\n=== PARTIAL FILLABLE TEST ===');
    console.log('Success:', result.success);
    console.log('Algorithm:', result.algorithm);
    console.log('Warnings:', result.warnings);
    console.log('Assignments:', JSON.stringify(result.assignments, null, 2));
    console.log('=============================\n');
    
    if (result.algorithm === 'yalps-fallback') {
      // Fallback should fill what it can
      expect(result.success).toBe(true);
      
      // Should have some assignments
      const totalAssignments = Object.values(result.assignments).flat().length;
      expect(totalAssignments).toBeGreaterThan(0);
      
      // Should have warnings about unfillable shifts
      expect(result.warnings.length).toBeGreaterThan(0);
    } else {
      // If main scheduler works, all fillable shifts should be filled
      expect(result.success).toBe(true);
      expect(result.assignments['cook-shift-1']).toContain('alice');
      expect(result.assignments['server-shift-1']).toContain('bob');
    }
  });

  it('should handle completely impossible scenarios gracefully', () => {
    const staff = [
      {
        id: "alice",
        name: "Alice Smith",
        traitIds: [],
        constraints: {
          maxShiftsPerDay: 0, // Can't work any shifts at all
          maxShiftsPerWeek: 0,
          maxShiftsPerMonth: 0,
          maxShiftsPerYear: 0,
          incompatibleWith: [],
          restDaysWithStaff: [],
          consecutiveRestDays: []
        },
        blockedTimes: [
          // Block the entire week so no shifts are possible
          {
            id: "block-1",
            startDateTime: new Date(2024, 0, 14, 0, 0),
            endDateTime: new Date(2024, 0, 21, 23, 59),
            isFullDay: false
          }
        ]
      }
    ];

    const shifts = [
      {
        id: "impossible-shift",
        name: "Impossible Shift",
        startDateTime: new Date(2024, 0, 15, 9, 0),
        endDateTime: new Date(2024, 0, 15, 17, 0),
        requirements: {
          staffCount: 1,
          requiredTraits: []
        },
        assignedStaff: []
      }
    ];

    const weekStart = new Date(2024, 0, 15);
    const result = yalpsAutoScheduleWeek(shifts as unknown as ShiftOccurrence[], staff, weekStart, mockTFunction);
    
    console.log('\n=== IMPOSSIBLE SCENARIO TEST ===');
    console.log('Success:', result.success);
    console.log('Algorithm:', result.algorithm);
    console.log('Errors:', result.errors);
    console.log('================================\n');
    
    // Should fail completely as nothing can be scheduled
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    
    // Should have no assignments
    const totalAssignments = Object.values(result.assignments).flat().length;
    expect(totalAssignments).toBe(0);
  });
});