import { useState, useEffect, useMemo, useCallback } from 'react';
import { Calendar, dateFnsLocalizer, type Event, type View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { enUS, de } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import type { StaffMember } from '../../storage/database';
import { Database } from '../../storage/database';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import '../../styles/calendar.css';

interface BlockedTimeEvent extends Event {
  staffId: string;
  staffName: string;
  isFullDay: boolean;
  isRecurring: boolean;
}

export function StaffBlockedTimeCalendar() {
  const { t, i18n } = useTranslation();
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [showAllStaff, setShowAllStaff] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState<View>('month');
  const [minTime, setMinTime] = useState(new Date(2000, 1, 1, 6, 0, 0)); // 6:00 AM
  const [maxTime, setMaxTime] = useState(new Date(2000, 1, 1, 23, 0, 0)); // 11:00 PM
  const [viewRange, setViewRange] = useState({
    start: startOfMonth(subMonths(new Date(), 1)),
    end: endOfMonth(addMonths(new Date(), 1))
  });

  useEffect(() => {
    const loadStaff = async () => {
      const staff = await Database.getStaffMembers();
      setStaffMembers(staff);
      // Initially select all staff
      setSelectedStaffIds(staff.map(s => s.id));
    };
    loadStaff();
  }, []);

  // Setup localizer for react-big-calendar
  const locales = {
    'en': enUS,
    'de': de,
  };

  const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek,
    getDay,
    locales,
  });

  // Expand recurring blocked times into individual events
  const expandBlockedTime = (
    staffMember: StaffMember,
    blockedTime: StaffMember['blockedTimes'][0],
    viewStart: Date,
    viewEnd: Date
  ): BlockedTimeEvent[] => {
    const events: BlockedTimeEvent[] = [];

    if (!blockedTime.recurrence) {
      // Single occurrence
      events.push({
        title: `${staffMember.name}${blockedTime.isFullDay ? ' (Full Day)' : ''}`,
        start: blockedTime.startDateTime,
        end: blockedTime.endDateTime,
        staffId: staffMember.id,
        staffName: staffMember.name,
        isFullDay: blockedTime.isFullDay,
        isRecurring: false,
        allDay: blockedTime.isFullDay,
      });
    } else {
      // Recurring occurrence - expand within view range
      const recurrence = blockedTime.recurrence;
      const current = new Date(blockedTime.startDateTime);
      const endDate = recurrence.endDate ? new Date(recurrence.endDate) : viewEnd;
      const duration = blockedTime.endDateTime.getTime() - blockedTime.startDateTime.getTime();

      while (current <= endDate && current <= viewEnd) {
        // Check if this occurrence is within the view
        if (current >= viewStart) {
          // For weekly recurrence, check weekdays
          if (recurrence.type === 'weekly' && recurrence.weekdays && recurrence.weekdays.length > 0) {
            if (recurrence.weekdays.includes(current.getDay())) {
              const eventEnd = new Date(current.getTime() + duration);
              events.push({
                title: `${staffMember.name}${blockedTime.isFullDay ? ' (Full Day)' : ''} [R]`,
                start: new Date(current),
                end: eventEnd,
                staffId: staffMember.id,
                staffName: staffMember.name,
                isFullDay: blockedTime.isFullDay,
                isRecurring: true,
                allDay: blockedTime.isFullDay,
              });
            }
          } else {
            // Daily or monthly recurrence
            const eventEnd = new Date(current.getTime() + duration);
            events.push({
              title: `${staffMember.name}${blockedTime.isFullDay ? ' (Full Day)' : ''} [R]`,
              start: new Date(current),
              end: eventEnd,
              staffId: staffMember.id,
              staffName: staffMember.name,
              isFullDay: blockedTime.isFullDay,
              isRecurring: true,
              allDay: blockedTime.isFullDay,
            });
          }
        }

        // Advance to next occurrence
        if (recurrence.type === 'daily') {
          current.setDate(current.getDate() + recurrence.interval);
        } else if (recurrence.type === 'weekly') {
          current.setDate(current.getDate() + (7 * recurrence.interval));
        } else if (recurrence.type === 'monthly') {
          current.setMonth(current.getMonth() + recurrence.interval);
        }
      }
    }

    return events;
  };

  // Handle calendar navigation
  const onNavigate = useCallback((newDate: Date) => {
    setCurrentDate(newDate);
    // Expand range by 1 month on each side for better performance
    setViewRange({
      start: startOfMonth(subMonths(newDate, 1)),
      end: endOfMonth(addMonths(newDate, 1))
    });
  }, []);

  // Handle view change
  const onViewChange = useCallback((newView: View) => {
    setCurrentView(newView);
  }, []);

  // Handle range change (when view changes between month/week/day)
  const onRangeChange = useCallback((range: Date[] | { start: Date; end: Date }) => {
    if (Array.isArray(range)) {
      // Week or day view
      const start = range[0];
      const end = range[range.length - 1];
      setViewRange({
        start: startOfMonth(subMonths(start, 1)),
        end: endOfMonth(addMonths(end, 1))
      });
    } else {
      // Month view
      setViewRange({
        start: startOfMonth(subMonths(range.start, 1)),
        end: endOfMonth(addMonths(range.end, 1))
      });
    }
  }, []);

  // Generate all blocked time events
  const events = useMemo(() => {
    const allEvents: BlockedTimeEvent[] = [];

    staffMembers.forEach(staffMember => {
      // Filter by selected staff
      if (!showAllStaff && !selectedStaffIds.includes(staffMember.id)) {
        return;
      }

      staffMember.blockedTimes.forEach(blockedTime => {
        const expanded = expandBlockedTime(staffMember, blockedTime, viewRange.start, viewRange.end);
        allEvents.push(...expanded);
      });
    });

    return allEvents;
  }, [staffMembers, selectedStaffIds, showAllStaff, viewRange]);

  const handleStaffToggle = (staffId: string) => {
    setSelectedStaffIds(prev =>
      prev.includes(staffId)
        ? prev.filter(id => id !== staffId)
        : [...prev, staffId]
    );
    setShowAllStaff(false);
  };

  const handleShowAll = () => {
    setShowAllStaff(true);
    setSelectedStaffIds(staffMembers.map(s => s.id));
  };

  // Custom event styling based on staff member
  const eventStyleGetter = (event: BlockedTimeEvent) => {
    const staffIndex = staffMembers.findIndex(s => s.id === event.staffId);
    const colors = [
      '#3174ad',
      '#d9534f',
      '#5cb85c',
      '#f0ad4e',
      '#5bc0de',
      '#9b59b6',
      '#e74c3c',
      '#1abc9c',
    ];

    const backgroundColor = colors[staffIndex % colors.length];

    return {
      style: {
        backgroundColor,
        borderRadius: '4px',
        opacity: event.isRecurring ? 0.8 : 1,
        color: 'white',
        border: '0px',
        display: 'block',
      },
    };
  };

  return (
    <div className="calendar-view">
      <div className="view-header">
        <h1>{t('navigation.staffBlockedTimes')}</h1>
      </div>

      <div className="view-content">
        <div className="calendar-filters" style={{ marginBottom: '20px', padding: '15px', borderRadius: '4px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginBottom: '15px', alignItems: 'center' }}>
            <div>
              <button
                onClick={handleShowAll}
                className={`btn ${showAllStaff ? 'btn-primary' : 'btn-secondary'}`}
              >
                {t('calendar.showAll')}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <label style={{ fontSize: '0.9em', fontWeight: 'bold' }}>{t('calendar.timeRange')}:</label>
              <input
                type="time"
                value={format(minTime, 'HH:mm')}
                onChange={(e) => {
                  const [hours, minutes] = e.target.value.split(':');
                  setMinTime(new Date(2000, 1, 1, parseInt(hours), parseInt(minutes), 0));
                }}
                style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--accent-gray)', background: 'var(--input-background)', color: 'var(--text-color)' }}
              />
              <span>—</span>
              <input
                type="time"
                value={format(maxTime, 'HH:mm')}
                onChange={(e) => {
                  const [hours, minutes] = e.target.value.split(':');
                  setMaxTime(new Date(2000, 1, 1, parseInt(hours), parseInt(minutes), 0));
                }}
                style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--accent-gray)', background: 'var(--input-background)', color: 'var(--text-color)' }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <span style={{ fontWeight: 'bold' }}>
              {t('calendar.filterByStaff')}:
            </span>
          </div>
          <div className="staff-filter-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {staffMembers.map(staff => (
              <label key={staff.id} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={selectedStaffIds.includes(staff.id)}
                  onChange={() => handleStaffToggle(staff.id)}
                  style={{ marginRight: '5px' }}
                />
                <span>{staff.name}</span>
              </label>
            ))}
          </div>
          <div style={{ marginTop: '10px', fontSize: '0.9em', color: '#666' }}>
            <span>[R] = {t('calendar.recurringEvent')}</span>
          </div>
        </div>

        <div className="calendar-container" style={{ height: '600px' }}>
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            date={currentDate}
            view={currentView}
            views={['month', 'week', 'day']}
            onNavigate={onNavigate}
            onView={onViewChange}
            onRangeChange={onRangeChange}
            min={minTime}
            max={maxTime}
            style={{ height: '100%' }}
            eventPropGetter={eventStyleGetter}
            culture={i18n.language}
            messages={{
              today: t('staff.today'),
              previous: t('planning.previousWeek'),
              next: t('planning.nextWeek'),
              month: t('staff.month'),
              week: t('staff.week'),
              day: t('common.day'),
              date: t('calendar.date'),
              time: t('calendar.time'),
              event: t('calendar.event'),
              noEventsInRange: t('calendar.noBlockedTimes'),
            }}
          />
        </div>
      </div>
    </div>
  );
}
