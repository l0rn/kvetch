import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format, startOfWeek, addWeeks, subWeeks, isWeekend, addDays } from 'date-fns';
import { enUS, de } from 'date-fns/locale';
import type { ShiftOccurrence, StaffMember, Trait } from "../../storage/database";
import { calculateStaffingStatus, type StaffingStatus } from '../../utils/staffingStatus';
import { yalpsAutoScheduleWeek, type YALPSSchedulingResult } from '../../utils/yalpsScheduler';
import { ConfirmDialog } from '../ConfirmDialog';
import '../../styles/planning.css';


interface WeeklyPlanningViewProps {
  shiftOccurrences: ShiftOccurrence[];
  staff: StaffMember[];
  allTraits: Trait[];
  onAssignStaffToShift: (occurrenceId: string, staffId: string) => void;
  onUnassignStaffFromShift: (occurrenceId: string, staffId: string) => void;
  onEditOccurrence?: (occurrence: ShiftOccurrence) => void;
  onUpdateShiftOccurrences?: (updatedOccurrences: { [occurrenceId: string]: string[] }) => void;
  onShowToast?: (type: 'success' | 'warning' | 'error', title: string, message?: string, duration?: number) => void;
}

export function WeeklyPlanningView({
  shiftOccurrences,
  staff,
  allTraits,
  onAssignStaffToShift,
  onUnassignStaffFromShift,
  onEditOccurrence,
  onUpdateShiftOccurrences,
  onShowToast
}: WeeklyPlanningViewProps) {
  const { weekStr } = useParams<{ weekStr?: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  
  // Get the appropriate date-fns locale based on current language
  const dateLocale = i18n.language === 'de' ? de : enUS;
  
  // Parse week from URL or default to current week
  const currentWeek = weekStr ? new Date(weekStr) : startOfWeek(new Date());
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);
  
  // Weekend visibility toggle
  const [showWeekends, setShowWeekends] = useState(() => {
    const saved = localStorage.getItem('weeklyPlanning_showWeekends');
    return saved ? JSON.parse(saved) : false;
  });
  
  // Dragging state
  const [draggedStaff, setDraggedStaff] = useState<StaffMember | null>(null);
  
  // Confirm dialog states
  const [clearAssignmentsDialog, setClearAssignmentsDialog] = useState(false);
  const [autoScheduleDialog, setAutoScheduleDialog] = useState(false);

  useEffect(() => {
    localStorage.setItem('weeklyPlanning_showWeekends', JSON.stringify(showWeekends));
  }, [showWeekends]);

  const navigateToWeek = (newWeek: Date) => {
    const weekStr = format(newWeek, 'yyyy-MM-dd');
    navigate(`/planning/${weekStr}`);
    setSelectedWeek(newWeek);
  };

  const goToPreviousWeek = () => {
    const previousWeek = subWeeks(selectedWeek, 1);
    navigateToWeek(previousWeek);
  };

  const goToNextWeek = () => {
    const nextWeek = addWeeks(selectedWeek, 1);
    navigateToWeek(nextWeek);
  };

  const goToCurrentWeek = () => {
    const currentWeek = startOfWeek(new Date());
    navigateToWeek(currentWeek);
  };

  const weekOccurrences = useMemo(() => shiftOccurrences.filter(occ => {
      const occDate = new Date(occ.startDateTime);
      const weekStart = startOfWeek(selectedWeek);
      const weekEnd = addWeeks(weekStart, 1);
      return occDate >= weekStart && occDate < weekEnd;
    }), [shiftOccurrences, selectedWeek]
  );

  // Get unique shifts that have occurrences this week
  const uniqueShifts = Array.from(
    new Map(
      weekOccurrences.map(occ => [
        `${occ.name}-${format(new Date(occ.startDateTime), 'HH:mm')}-${format(new Date(occ.endDateTime), 'HH:mm')}`,
        {
          name: occ.name,
          startTime: format(new Date(occ.startDateTime), 'HH:mm'),
          endTime: format(new Date(occ.endDateTime), 'HH:mm'),
          timeDisplay: `${format(new Date(occ.startDateTime), 'HH:mm')}-${format(new Date(occ.endDateTime), 'HH:mm')}`
        }
      ])
    ).values()
  );

  // Generate weekdays for columns
  const weekDays: Date[] = [];
  const weekStart = startOfWeek(selectedWeek);
  for (let i = 0; i < 7; i++) {
    const day = addDays(weekStart, i);
    if (showWeekends || !isWeekend(day)) {
      weekDays.push(day);
    }
  }

  // Get occurrence for a specific shift and day
  const getOccurrenceForShiftAndDay = (shiftKey: string, day: Date) => {
    return weekOccurrences.find(occ => {
      const occDate = new Date(occ.startDateTime);
      const shiftTimeKey = `${occ.name}-${format(occDate, 'HH:mm')}-${format(new Date(occ.endDateTime), 'HH:mm')}`;
      return shiftTimeKey === shiftKey && 
             format(occDate, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd');
    });
  };
  // Refresh key for forcing re-evaluation
  const [refreshKey, setRefreshKey] = useState(new Date());
  // Memoized staffing status cache - only recalculates when relevant data changes
  const staffingStatusCache = useMemo(() => {
    const cache: { [occurrenceId: string]: { statusClassName: string; status: StaffingStatus } } = {};
    
    for (const occurrence of weekOccurrences) {
      const assignedStaffMembers = staff.filter(s => occurrence.assignedStaff.includes(s.id));
      const status = calculateStaffingStatus(occurrence, assignedStaffMembers, allTraits, t, i18n.language, shiftOccurrences, staff);
      
      let statusClassName: string;
      switch (status.status) {
        case 'properly-staffed':
          statusClassName = 'status-properly-staffed';
          break;
        case 'understaffed':
          statusClassName = 'status-under-staffed';
          break;
        case 'not-staffed':
        case 'constraint-violation':
          statusClassName = 'status-constraint-violation';
          break;
        default:
          statusClassName = 'status-under-staffed';
      }
      
      cache[occurrence.id] = { statusClassName, status };
    }
    
    return cache;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff, allTraits, shiftOccurrences, t, weekOccurrences, i18n.language, refreshKey]);

  const getStaffingClass = (occurrence: ShiftOccurrence | undefined): string => {
    if (!occurrence) return 'shift-cell-empty';
    return staffingStatusCache[occurrence.id]?.statusClassName || 'status-under-staffed';
  };

  // Calculate staff scheduling status and counts
  const getStaffSchedulingInfo = (staffMember: StaffMember) => {
    // Get current week, month, and year boundaries
    const currentWeek = startOfWeek(selectedWeek);
    const weekEnd = addWeeks(currentWeek, 1);
    
    // Count shifts for this staff member in different periods
    const shiftsThisWeek = shiftOccurrences.filter(occ => {
      const occDate = new Date(occ.startDateTime);
      return occ.assignedStaff.includes(staffMember.id) && 
             occDate >= currentWeek && occDate < weekEnd;
    }).length;
    
    // Current month (from start of month containing the selected week)
    const currentMonth = new Date(selectedWeek.getFullYear(), selectedWeek.getMonth(), 1);
    const nextMonth = new Date(selectedWeek.getFullYear(), selectedWeek.getMonth() + 1, 1);
    const shiftsThisMonth = shiftOccurrences.filter(occ => {
      const occDate = new Date(occ.startDateTime);
      return occ.assignedStaff.includes(staffMember.id) && 
             occDate >= currentMonth && occDate < nextMonth;
    }).length;
    
    // Current year (from start of year containing the selected week)
    const currentYear = new Date(selectedWeek.getFullYear(), 0, 1);
    const nextYear = new Date(selectedWeek.getFullYear() + 1, 0, 1);
    const shiftsThisYear = shiftOccurrences.filter(occ => {
      const occDate = new Date(occ.startDateTime);
      return occ.assignedStaff.includes(staffMember.id) && 
             occDate >= currentYear && occDate < nextYear;
    }).length;
    
    const dailyMax = staffMember.constraints?.maxShiftsPerDay ?? 1;
    const weeklyMax = staffMember.constraints?.maxShiftsPerWeek ?? 5;
    const monthlyMax = staffMember.constraints?.maxShiftsPerMonth ?? 21;
    const yearlyMax = staffMember.constraints?.maxShiftsPerYear || Infinity;
    
    // Count shifts today for this staff member
    const today = new Date();
    const shiftsToday = shiftOccurrences.filter(occ => {
      const occDate = new Date(occ.startDateTime);
      return occ.assignedStaff.includes(staffMember.id) && 
             occDate.toDateString() === today.toDateString();
    }).length;

    let status = 'unscheduled'; // gray
    if (shiftsToday > dailyMax || shiftsThisWeek > weeklyMax || shiftsThisMonth > monthlyMax || shiftsThisYear > yearlyMax) {
      status = 'overscheduled'; // orange
    } else if (shiftsThisWeek > 0) {
      status = 'scheduled'; // green
    }
    
    return {
      status,
      shiftsToday,
      shiftsThisWeek,
      shiftsThisMonth,
      shiftsThisYear,
      dailyMax,
      weeklyMax,
      monthlyMax,
      yearlyMax
    };
  };

  const getStaffStatusColor = (status: string) => {
    switch (status) {
      case 'overscheduled': return 'var(--warning-color)';
      default: return 'var(--success-color)';
    }
  };

  // Handle staff drag start
  const handleStaffDragStart = (e: React.DragEvent, staffMember: StaffMember) => {
    setDraggedStaff(staffMember);
    e.dataTransfer.setData('text/plain', staffMember.id);
  };

  // Handle drop on shift cell
  const handleShiftDrop = (e: React.DragEvent, occurrence: ShiftOccurrence | undefined) => {
    e.preventDefault();
    if (draggedStaff && occurrence && !occurrence.assignedStaff.includes(draggedStaff.id)) {
      onAssignStaffToShift(occurrence.id, draggedStaff.id);
    }
    setDraggedStaff(null);
  };

  const handleShiftDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Handle remove staff from shift
  const handleRemoveStaff = (occurrenceId: string, staffId: string) => {
    onUnassignStaffFromShift(occurrenceId, staffId);
  };

  // Handle print functionality
  const handlePrint = () => {
    window.print();
  };

  // Handle clear all assignments for the current week
  const handleClearAllAssignments = () => {
    if (!onUpdateShiftOccurrences) {
      onShowToast?.('error', 'Error', 'Clear assignments callback not provided');
      return;
    }

    // Show confirmation dialog
    setClearAssignmentsDialog(true);
  };

  const confirmClearAssignments = () => {
    // Create assignments object with empty arrays for all week occurrences
    const clearAssignments: { [occurrenceId: string]: string[] } = {};
    weekOccurrences.forEach(occurrence => {
      clearAssignments[occurrence.id] = [];
    });
    
    // Apply the cleared assignments
    onUpdateShiftOccurrences!(clearAssignments);
    
    onShowToast?.('success', t('common.success'), t('planning.clearAllAssignmentsConfirm'));
    setClearAssignmentsDialog(false);
  };

  const confirmAutoSchedule = () => {
    setAutoScheduleDialog(false);
    performAutoSchedule();
  };

  // Handle auto-schedule for the current week
  const handleAutoSchedule = async () => {
    if (!onUpdateShiftOccurrences) {
      onShowToast?.('error', t('autoScheduler.failure'), 'Auto-scheduling callback not provided');
      return;
    }

    if (!onShowToast) {
      console.warn('No toast callback provided to WeeklyPlanningView');
      return;
    }

    // Check if there are existing assignments for this week
    const hasExistingAssignments = weekOccurrences.some(occ => occ.assignedStaff.length > 0);
    
    // Show confirmation dialog if there are existing assignments
    if (hasExistingAssignments) {
      setAutoScheduleDialog(true);
      return;
    }

    // Proceed with auto-scheduling
    performAutoSchedule();
  };

  const performAutoSchedule = async () => {
    const weekStart = startOfWeek(selectedWeek);
    
    for (const occurrence of weekOccurrences) {
      occurrence.assignedStaff = []; // Clear existing assignments
    }
    
    // Try CSP scheduler first (most advanced)
    const result: YALPSSchedulingResult = yalpsAutoScheduleWeek(shiftOccurrences, staff, weekStart, t);
    console.log(`[WeeklyPlanningView] YALPS scheduler result: success=${result.success}, algorithm=${result.algorithm || 'unknown'}`);

    setRefreshKey(new Date());

    if (result.success && result.warnings.length === 0) {
      onShowToast?.('success', t('autoScheduler.success'));
    } else if (result.success && result.warnings.length > 0) {
      // Format constraint violations in a condensed list
      const violationMessages = result.warnings.map(warning => {
        // Parse the warning to extract staff name and violation type
        const staffMatch = warning.match(/^([^:]+):/);
        const staffName = staffMatch ? staffMatch[1] : '';
        
        if (warning.includes('weekly limit')) {
          return t('autoScheduler.constraintViolation', { 
            staffName,
            violation: warning.split(': ')[1] || warning
          });
        } else if (warning.includes('monthly limit')) {
          return t('autoScheduler.constraintViolation', { 
            staffName,
            violation: warning.split(': ')[1] || warning
          });
        } else if (warning.includes('yearly limit')) {
          return t('autoScheduler.constraintViolation', { 
            staffName,
            violation: warning.split(': ')[1] || warning
          });
        }
        return warning;
      });

      const condensedMessage = `• ${violationMessages.slice(0, 5).join('\n• ')}${violationMessages.length > 5 ? `\n• +${violationMessages.length - 5} more...` : ''}`;
      
      onShowToast?.(
        'warning',
        t('autoScheduler.partialSuccess'),
        condensedMessage,
        12000
      );
    } else {
      // Format errors in a condensed list  
      const errorMessages = result.errors.map(error => {
        // Extract shift name and date for cleaner display
        const shiftMatch = error.match(/Shift "([^"]+)" on ([0-9-]+)/);
        if (shiftMatch) {
          const [, shiftName, dateStr] = shiftMatch;
          const assignedMatch = error.match(/assigned (\d+)\/(\d+)/);
          if (assignedMatch) {
            const [, assigned, required] = assignedMatch;
            return t('autoScheduler.shiftUnfilled', { 
              shiftName, 
              date: dateStr,
              assigned,
              required
            });
          }
        }
        
        // Check for trait requirement errors
        if (error.includes('requires') && error.includes('trait')) {
          return error; // Keep trait requirement errors as-is for now
        }
        
        return error;
      });

      const condensedMessage = `• ${errorMessages.slice(0, 5).join('\n• ')}${errorMessages.length > 5 ? `\n• +${errorMessages.length - 5} more...` : ''}`;
      
      onShowToast?.(
        'error',
        t('autoScheduler.failure'),
        condensedMessage,
        12000
      );
    }

    // Apply the assignments
    onUpdateShiftOccurrences?.(result.assignments);
  };

  return (
    <div className="weekly-planning-container">
      {/* Staff Panel */}
      <div className="staff-panel">
        <h3 style={{ margin: '0 0 16px 0', color: 'var(--secondary-color)' }}>{t('planning.staffMembers')}</h3>
        
        <div className="staff-members">
          {staff.map(staffMember => {
            const staffInfo = getStaffSchedulingInfo(staffMember);
            const statusColor = getStaffStatusColor(staffInfo.status);
            
            return (
              <div
                className="staff-member staff-panel-member"
                key={staffMember.id}
                draggable
                onDragStart={(e) => handleStaffDragStart(e, staffMember)}
                style={{ borderColor: statusColor }}
                onMouseDown={(e) => (e.currentTarget.style.cursor = 'grabbing')}
                onMouseUp={(e) => (e.currentTarget.style.cursor = 'grab')}
              >
                <div className="staff-panel-member-name">
                  {staffMember.name}
                </div>
                <div className="staff-panel-member-info">
                  {t('staff.week')}: {staffInfo.shiftsThisWeek}/{staffInfo.weeklyMax === Infinity ? '∞' : staffInfo.weeklyMax}
                </div>
                <div className="staff-panel-member-info">
                  {t('staff.month')}: {staffInfo.shiftsThisMonth}/{staffInfo.monthlyMax === Infinity ? '∞' : staffInfo.monthlyMax}
                </div>
                <div className="staff-panel-member-info" style={{marginBottom: '4px'}}>
                  {t('staff.year')}: {staffInfo.shiftsThisYear}/{staffInfo.yearlyMax === Infinity ? '∞' : staffInfo.yearlyMax}
                </div>
                {staffMember.traitIds.length > 0 && (
                  <div className="staff-panel-member-traits">
                    {staffMember.traitIds.map(traitId => 
                      allTraits.find(t => t.id === traitId)?.name
                    ).filter(Boolean).join(', ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Calendar Panel */}
      <div className="calendar-panel">
        {/* Print Title - Only visible when printing */}
        <div className="print-title" style={{ display: 'none' }}>
          {t('planning.title')} - {t('planning.weekOf', { date: format(selectedWeek, 'MMM dd, yyyy', { locale: dateLocale }) })}
          <span className="print-app-title" style={{ display: 'none' }}>
            Kvetch
          </span>
        </div>

        {/* Week Navigation */}
        <div className="week-nav-container no-print">
          <div className="week-nav-controls">
            <button 
              onClick={goToPreviousWeek}
              className="week-nav-btn prev"
            >
              {t('planning.previousWeek')}
            </button>
            <button 
              onClick={goToCurrentWeek}
              className="week-nav-btn current"
            >
              {t('planning.thisWeek')}
            </button>
            <button 
              onClick={goToNextWeek}
              className="week-nav-btn next"
            >
              {t('planning.nextWeek')}
            </button>
          </div>

          <div className="week-nav-title">
            {t('planning.weekOf', { date: format(selectedWeek, 'MMM dd, yyyy', { locale: dateLocale }) })}
          </div>

          <div className="week-nav-actions">
            <button
              onClick={handlePrint}
              className="btn btn-secondary no-print"
              title={t('planning.printTooltip')}
              style={{ 
                fontSize: '14px',
                padding: '6px 12px'
              }}
            >
              🖨 {t('planning.print')}
            </button>

            <button
              onClick={handleAutoSchedule}
              className="btn btn-primary no-print"
              title={t('planning.autoScheduleTooltip')}
              disabled={weekOccurrences.length === 0}
              style={{ 
                fontSize: '14px',
                padding: '6px 12px',
                opacity: weekOccurrences.length === 0 ? 0.5 : 1
              }}
            >
              {t('planning.autoSchedule')}
            </button>

            <button
              onClick={handleClearAllAssignments}
              className="btn btn-secondary no-print"
              title={t('planning.clearAllAssignmentsTooltip')}
              disabled={weekOccurrences.length === 0 || !weekOccurrences.some(occ => occ.assignedStaff.length > 0)}
              style={{ 
                fontSize: '14px',
                padding: '6px 12px',
                opacity: (weekOccurrences.length === 0 || !weekOccurrences.some(occ => occ.assignedStaff.length > 0)) ? 0.5 : 1
              }}
            >
              🗑 {t('planning.clearAllAssignments')}
            </button>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} className="no-print">
              <input
                type="checkbox"
                checked={showWeekends}
                onChange={(e) => setShowWeekends(e.target.checked)}
              />
              <span>{t('planning.showWeekends')}</span>
            </label>
          </div>
        </div>

        {/* Shift Table */}
        <div className="shift-table-container">
          <table className="shift-table">
            <thead>
              <tr>
                <th className="shift-header">
                  {t('planning.shift')}
                </th>
                {weekDays.map(day => (
                  <th key={day.toISOString()} className="day-header">
                    <div>{format(day, 'EEEE', { locale: dateLocale })}</div>
                    <div>
                      {day.toLocaleDateString(dateLocale.code, { 
                        month: 'short', 
                        day: '2-digit' 
                      })}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {uniqueShifts.map(shift => {
                const shiftKey = `${shift.name}-${shift.startTime}-${shift.endTime}`;
                return (
                  <tr key={shiftKey}>
                    <td className="shift-name-cell">
                      <div>{shift.name}</div>
                      <div>{shift.timeDisplay}</div>
                    </td>
                    {weekDays.map(day => {
                      const occurrence = getOccurrenceForShiftAndDay(shiftKey, day);
                      const staffingClass = getStaffingClass(occurrence);
                      const assignedStaffMembers = occurrence 
                        ? staff.filter(s => occurrence.assignedStaff.includes(s.id))
                        : [];
                      
                      return (
                        <td
                          key={`${shiftKey}-${day.toISOString()}`}
                          className={`shift-cell ${staffingClass}`}
                          style={{ cursor: occurrence ? 'pointer' : 'default' }}
                          onDrop={(e) => handleShiftDrop(e, occurrence)}
                          onDragOver={handleShiftDragOver}
                          onClick={() => occurrence && onEditOccurrence?.(occurrence)}
                        >
                          {occurrence ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {assignedStaffMembers.map(staffMember => (
                                <div key={staffMember.id} className="staff-badge">
                                  <span className="staff-badge-name">
                                    {staffMember.name}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveStaff(occurrence.id, staffMember.id);
                                    }}
                                    className="staff-badge-remove-btn"
                                    title={`Remove ${staffMember.name}`}
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                              {assignedStaffMembers.length === 0 && (
                                <div className="unassigned-text">
                                  {t('planning.noStaffAssigned')}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="no-occurrence-text">
                              ✕
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirm Dialogs */}
      <ConfirmDialog
        isOpen={clearAssignmentsDialog}
        title={t('planning.clearAllAssignmentsConfirm')}
        message={t('planning.clearAllAssignmentsMessage')}
        confirmText={t('common.yes')}
        cancelText={t('common.cancel')}
        onConfirm={confirmClearAssignments}
        onCancel={() => setClearAssignmentsDialog(false)}
      />

      <ConfirmDialog
        isOpen={autoScheduleDialog}
        title={t('planning.autoScheduleConfirm')}
        message={t('planning.autoScheduleMessage')}
        confirmText={t('common.yes')}
        cancelText={t('common.cancel')}
        onConfirm={confirmAutoSchedule}
        onCancel={() => setAutoScheduleDialog(false)}
      />
    </div>
  );
}