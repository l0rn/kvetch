import { addDays, addWeeks, addMonths, isAfter, parseISO, getDaysInMonth, getDate, setDate, getDay } from 'date-fns';
import type { Shift, ShiftOccurrence } from "../storage/database";

// Helper function to add months while preserving the day of month (with fallback to last day)
export const addMonthsWithDayPreservation = (date: Date, monthsToAdd: number): { date: Date, dayAdjusted: boolean } => {
  const originalDay = getDate(date);
  const targetDate = addMonths(date, monthsToAdd);
  const daysInTargetMonth = getDaysInMonth(targetDate);
  
  if (originalDay <= daysInTargetMonth) {
    // Original day exists in target month
    return { date: setDate(targetDate, originalDay), dayAdjusted: false };
  } else {
    // Original day doesn't exist, use last day of target month
    return { date: setDate(targetDate, daysInTargetMonth), dayAdjusted: true };
  }
};

// Utility function to generate shift occurrences from recurring shifts
export const generateShiftOccurrences = (shift: Shift): ShiftOccurrence[] => {
  const occurrences: ShiftOccurrence[] = [];
  
  // Always create the first occurrence
  const shiftDateTimestamp = new Date(shift.startDateTime).getTime().toString();
  occurrences.push({
    id: `${shift.id}-${shiftDateTimestamp}-0`,  // Add index to ensure uniqueness
    parentShiftId: shift.id,
    name: shift.name,
    startDateTime: shift.startDateTime,
    endDateTime: shift.endDateTime,
    requirements: shift.requirements,
    assignedStaff: [], // New occurrences start with no assigned staff
    isModified: false,
    isDeleted: false
  });
  
  // Generate recurring occurrences if recurrence is defined
  if (shift.recurrence) {
    let currentDate = new Date(shift.startDateTime);
    const originalDate = new Date(shift.startDateTime);
    const shiftDuration = new Date(shift.endDateTime).getTime() - new Date(shift.startDateTime).getTime();
    const endDate = shift.recurrence.endDate ? parseISO(shift.recurrence.endDate) : addMonths(originalDate, 12); // Default to 1 year if no end date
    let occurrenceIndex = 1; // Start from 1 since 0 is used for the first occurrence
    const adjustedDates: string[] = []; // Track dates that were adjusted for info dialog
    
    while (true) {
      let nextDate: Date = currentDate;
      let dayAdjusted = false;
      
      // Calculate next occurrence date
      switch (shift.recurrence.type) {
        case 'daily':
          nextDate = addDays(currentDate, shift.recurrence.interval);
          break;
        case 'weekly': {
          if (shift.recurrence.weekdays && shift.recurrence.weekdays.length > 0) {
            // Find next occurrence on specified weekdays
            const currentWeekday = getDay(currentDate);
            const sortedWeekdays = [...shift.recurrence.weekdays].sort((a, b) => a - b);
            
            // Find next weekday in current week or next weeks
            let foundNextDate = false;
            for (const weekday of sortedWeekdays) {
              if (weekday > currentWeekday) {
                // Found next weekday in current week
                nextDate = addDays(currentDate, weekday - currentWeekday);
                foundNextDate = true;
                break;
              }
            }
            
            if (!foundNextDate) {
              // No more weekdays this week, go to first weekday of next occurrence week
              const daysToNextWeek = 7 - currentWeekday + sortedWeekdays[0];
              const weeksToAdd = shift.recurrence.interval - 1; // -1 because we're already adding days to next week
              nextDate = addDays(currentDate, daysToNextWeek + (weeksToAdd * 7));
            }
          } else {
            // Fallback to original weekly behavior if no weekdays specified
            nextDate = addWeeks(currentDate, shift.recurrence.interval);
          }
          break;
        }
        case 'monthly': {
          const monthResult = addMonthsWithDayPreservation(currentDate, shift.recurrence.interval);
          nextDate = monthResult.date;
          dayAdjusted = monthResult.dayAdjusted;
          if (dayAdjusted) {
            adjustedDates.push(nextDate.toISOString());
          }
          break;
        }
        default:
          nextDate = currentDate;
          break;
      }
      
      currentDate = new Date(nextDate);
      
      // Stop if we've exceeded the end date
      if (isAfter(currentDate, endDate)) {
        break;
      }
      
      const newEndDateTime = new Date(currentDate.getTime() + shiftDuration);
      const shiftStartTimestamp = currentDate.getTime().toString();
      
      // Avoid duplicating the original date (fix for daily recurrence issue)
      if (shiftStartTimestamp === shiftDateTimestamp) {
        continue;
      }
      
      occurrences.push({
        id: `${shift.id}-${shiftStartTimestamp}-${occurrenceIndex}`,  // Add index to ensure uniqueness
        parentShiftId: shift.id,
        name: shift.name,
        startDateTime: currentDate,
        endDateTime: newEndDateTime,
        requirements: shift.requirements,
        assignedStaff: [], // New occurrences start with no assigned staff
        isModified: false,
        isDeleted: false
      });
      occurrenceIndex++; // Increment index for next occurrence
    }
    
    // TODO: Show info dialog if any dates were adjusted for monthly recurrence
    if (adjustedDates.length > 0) {
      console.log(`Note: Some monthly recurrences were adjusted to the last day of the month: ${adjustedDates.join(', ')}`);
    }
  }
  
  return occurrences;
};