import { useState, useEffect, useMemo } from 'react';
import { format, startOfWeek, addDays, isSameDay, isToday, differenceInMinutes } from 'date-fns';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { fetchEventsInYear } from '../../datasources/salesforce';
import { useRepFilter } from '../../hooks/useRepFilter';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorState from '../../components/common/ErrorState';
import { useDashboard } from '../../context/DashboardContext';

// ── Helpers (ported from KpiDrillPanel) ───────────────────────────────────────

const CHIP_COLORS = {
  Virtual_meeting:      'bg-rs-teal/10 text-rs-teal border-rs-teal/20',
  VIRTUAL_MEETING:      'bg-rs-teal/10 text-rs-teal border-rs-teal/20',
  'Face-to-Face Meeting': 'bg-green-50 text-green-700 border-green-200',
  default:              'bg-rs-surface text-rs-muted border-rs-border',
};

function chipColor(type) {
  return CHIP_COLORS[type] || CHIP_COLORS.default;
}

function extractCompanyName(event) {
  if (event.What?.Name) return event.What.Name;
  let subj = (event.Subject || '').replace(/^Following:\s*/i, '').trim();
  if (!subj) return null;
  const isRS = (s) => /\b(RiskSpan|RS)\b/i.test(s);
  const arrow = subj.match(/^(.+?)\s*<>\s*(.+?)(?:\s[-–]|$)/);
  if (arrow) {
    const a = arrow[1].trim();
    const b = arrow[2].replace(/\s*(Phase\s*\d+)?\s*[-–].*$/, '').trim();
    if (!isRS(a)) return a;
    if (!isRS(b)) return b;
  }
  const beforeRS = subj.match(/^(.+?)\s*[-–/:]\s*(?:RiskSpan|RS)\b/i);
  if (beforeRS) {
    const name = beforeRS[1].replace(/^\w[\w\s]+:\s*/, '').trim();
    if (name) return name;
  }
  const afterRS = subj.match(/(?:RiskSpan|RS)\s*(?:<>|[-–/]|(?:\s+and\s+))\s*(.+?)(?:\s[-–]|$)/i);
  if (afterRS) return afterRS[1].replace(/\s*(Phase\s*\d+)?$/, '').trim();
  const withRS = subj.match(/^(.+?)\s+with\s+(?:RiskSpan|RS)\b/i);
  if (withRS) return withRS[1].trim();
  return null;
}

function parseMeetingNotes(description) {
  if (!description) return null;
  const raw = description.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  return raw.replace(/\n[-_]{3,}[\s\S]*/m, '').trim() || null;
}

function formatDuration(start, end) {
  if (!start || !end) return null;
  const mins = differenceInMinutes(new Date(end), new Date(start));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Event detail view ─────────────────────────────────────────────────────────

function EventDetail({ event, onBack }) {
  const notes = parseMeetingNotes(event.Description);
  const duration = formatDuration(event.StartDateTime, event.EndDateTime);

  return (
    <div className="rounded-card border border-rs-border bg-white p-5">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-rs-teal hover:underline mb-5"
      >
        ← Back to calendar
      </button>

      <div className="space-y-5">
        <div>
          <p className="text-base font-semibold text-rs-text leading-snug">{event.Subject || '—'}</p>
          {event.What?.Name && (
            <p className="text-sm font-medium text-rs-teal mt-1">{event.What.Name}</p>
          )}
        </div>

        <div className="divide-y divide-rs-border/50 text-sm rounded-card border border-rs-border overflow-hidden">
          {event.StartDateTime && (
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-rs-muted">Date</span>
              <span className="text-rs-text font-medium">
                {format(new Date(event.StartDateTime), 'EEE, MMM d, yyyy')}
              </span>
            </div>
          )}
          {event.StartDateTime && (
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-rs-muted">Time</span>
              <span className="text-rs-text">
                {format(new Date(event.StartDateTime), 'h:mm a')}
                {event.EndDateTime ? ` – ${format(new Date(event.EndDateTime), 'h:mm a')}` : ''}
                {duration ? <span className="text-rs-muted ml-1.5">({duration})</span> : null}
              </span>
            </div>
          )}
          {event.Type && (
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-rs-muted">Type</span>
              <span className="text-rs-text">{event.Type.replace(/_/g, ' ')}</span>
            </div>
          )}
          {event.Owner?.Name && (
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-rs-muted">Rep</span>
              <span className="text-rs-text">{event.Owner.Name}</span>
            </div>
          )}
        </div>

        {notes ? (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-rs-muted mb-2">Notes</p>
            <div className="bg-rs-surface rounded-lg px-4 py-3">
              <p className="text-sm text-rs-text leading-relaxed whitespace-pre-line">{notes}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-rs-muted italic">No meeting notes recorded</p>
        )}
      </div>
    </div>
  );
}

// ── Calendar grid ─────────────────────────────────────────────────────────────

function CalendarGrid({ events, weekStart, onEventClick }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = addDays(weekStart, 7);

  const weekEvents = useMemo(() => {
    return events.filter((e) => {
      const d = e.StartDateTime ? new Date(e.StartDateTime) : null;
      return d && d >= weekStart && d < weekEnd;
    });
  }, [events, weekStart]);

  const companies = useMemo(() => {
    const names = weekEvents.map(extractCompanyName).filter(Boolean);
    return [...new Set(names)];
  }, [weekEvents]);

  return (
    <div>
      {/* Companies summary strip */}
      <div className="mb-4 px-4 py-2.5 bg-rs-surface rounded-lg flex items-start gap-3 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-widest text-rs-muted whitespace-nowrap pt-0.5">
          {weekEvents.length} meeting{weekEvents.length !== 1 ? 's' : ''}
        </span>
        {companies.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {companies.slice(0, 6).map((c) => (
              <span key={c} className="text-[10px] bg-white border border-rs-border text-rs-text px-2 py-0.5 rounded-full">
                {c}
              </span>
            ))}
            {companies.length > 6 && (
              <span className="text-[10px] text-rs-muted px-1 py-0.5">+{companies.length - 6} more</span>
            )}
          </div>
        ) : (
          <span className="text-[10px] text-rs-muted pt-0.5">No meetings this week</span>
        )}
      </div>

      {/* 7-day grid */}
      <div className="grid grid-cols-7 gap-2">
        {days.map((day) => {
          const dayEvents = weekEvents.filter((e) =>
            e.StartDateTime && isSameDay(new Date(e.StartDateTime), day)
          );
          const today = isToday(day);
          return (
            <div key={day.toISOString()} className="flex flex-col min-h-[120px]">
              <div className={`text-center py-1.5 rounded-t mb-1 ${today ? 'bg-rs-teal text-white' : 'bg-rs-surface text-rs-muted'}`}>
                <p className="text-[9px] font-bold uppercase tracking-wide">{format(day, 'EEE')}</p>
                <p className={`text-sm font-semibold ${today ? 'text-white' : 'text-rs-text'}`}>{format(day, 'd')}</p>
              </div>
              <div className="flex flex-col gap-0.5 flex-1">
                {dayEvents.length === 0 && (
                  <span className="text-[9px] text-rs-border text-center mt-3">—</span>
                )}
                {dayEvents.map((e) => {
                  const company = extractCompanyName(e);
                  return (
                    <button
                      key={e.Id}
                      onClick={() => onEventClick(e)}
                      className={`w-full text-left px-1.5 py-1 rounded border text-[10px] font-medium leading-tight hover:opacity-80 transition-opacity ${chipColor(e.Type)}`}
                      title={e.Subject}
                    >
                      <span className="block truncate">{company || e.Subject || '—'}</span>
                      {company && e.Subject && (
                        <span className="block truncate opacity-60 text-[9px]">{e.Subject}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { triggerRefresh, refreshCount } = useDashboard();
  const currentYear = new Date().getFullYear();
  const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });

  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchEventsInYear(selectedYear)
      .then(setRawData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedYear, refreshCount]);

  const filtered = useRepFilter(rawData);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={triggerRefresh} />;
  }

  if (selectedEvent) {
    return <EventDetail event={selectedEvent} onBack={() => setSelectedEvent(null)} />;
  }

  return (
    <div>
      {/* Overview card */}
      <div className="rounded-card border border-rs-border bg-white p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-rs-text">Team Calendar</h2>
            <p className="text-[11px] text-rs-muted mt-0.5">Meetings by week</p>
          </div>

          {/* Year selector */}
          <div className="flex items-center gap-1 border border-rs-border rounded-lg px-2 py-1">
            <button
              onClick={() => setSelectedYear((y) => y - 1)}
              className="text-rs-muted hover:text-rs-text transition-colors p-0.5"
            >
              <ChevronLeftIcon className="h-3.5 w-3.5" />
            </button>
            <span className="text-sm font-semibold text-rs-text w-12 text-center">{selectedYear}</span>
            <button
              onClick={() => setSelectedYear((y) => y + 1)}
              className="text-rs-muted hover:text-rs-text transition-colors p-0.5"
            >
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Week navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => { setWeekStart((w) => addDays(w, -7)); setSelectedEvent(null); }}
            className="flex items-center gap-1 text-xs text-rs-muted hover:text-rs-text transition-colors px-2 py-1 rounded hover:bg-rs-surface"
          >
            <ChevronLeftIcon className="h-3.5 w-3.5" />
            Prev
          </button>
          <span className="text-sm font-semibold text-rs-text">
            {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d, yyyy')}
          </span>
          <button
            onClick={() => { setWeekStart((w) => addDays(w, 7)); setSelectedEvent(null); }}
            className="flex items-center gap-1 text-xs text-rs-muted hover:text-rs-text transition-colors px-2 py-1 rounded hover:bg-rs-surface"
          >
            Next
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="rounded-card border border-rs-border bg-white p-4">
        <CalendarGrid
          events={filtered || []}
          weekStart={weekStart}
          onEventClick={setSelectedEvent}
        />
      </div>
    </div>
  );
}
