import { describe, it } from 'vitest';
import { solve } from 'yalps';

describe('Basic YALPS Test', () => {
  it('should solve basic YALPS example', () => {
    // Example from YALPS documentation
    const model = {
      direction: "maximize" as const,
      objective: "profit",
      constraints: {
        wood: { max: 300 },
        labor: { max: 110 }
      },
      variables: {
        table: { wood: 30, labor: 5, profit: 1200 },
        dresser: { wood: 20, labor: 10, profit: 1600 }
      },
      integers: ["table", "dresser"]
    };

    const solution = solve(model);
    
    console.log('\n=== BASIC YALPS TEST ===');
    console.log('Solution:', solution);
    console.log('========================\n');
    
    if (!solution.result) {
      throw new Error(`YALPS failed: ${solution.status}`);
    }
  });

  it('should solve simple scheduling example', () => {
    // Simple scheduling: 1 staff, 1 shift
    const model = {
      direction: "maximize" as const,
      objective: "assignments",
      constraints: {
        // Shift must have exactly 1 person
        shift_requirement: { 
          equal: 1
        },
        // Alice can work max 1 shift per day
        daily_limit_alice: {
          max: 1
        }
      },
      variables: {
        "x_alice_shift1": { 
          assignments: 1,
          shift_requirement: 1,
          daily_limit_alice: 1
        }
      },
      binaries: ["x_alice_shift1"]
    };

    const solution = solve(model);
    
    console.log('\n=== SIMPLE SCHEDULING TEST ===');
    console.log('Solution:', solution);
    console.log('===============================\n');
    
    if (!solution.result) {
      throw new Error(`Simple scheduling failed: ${solution.status}`);
    }
  });
});