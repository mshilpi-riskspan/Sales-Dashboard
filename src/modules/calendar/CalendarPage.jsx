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

const CATEGORY_STYLES = {
  Renewal:    'bg-red-50 text-red-700 border-red-200',
  QBR:        'bg-purple-50 text-purple-700 border-purple-200',
  Demo:       'bg-rs-teal/10 text-rs-teal border-rs-teal/20',
  Trial:      'bg-amber-50 text-amber-700 border-amber-200',
  Kickoff:    'bg-green-50 text-green-700 border-green-200',
  'Check-in': 'bg-blue-50 text-blue-700 border-blue-200',
  Internal:   'bg-rs-surface text-rs-muted border-rs-border',
  Other:      'bg-white text-rs-muted border-rs-border',
};

function categoryStyle(category) {
  return CATEGORY_STYLES[category] || CATEGORY_STYLES.Other;
}

// Most CEO-relevant first — a category with 2 meetings but real stakes
// (Renewal) should read before a category with 25 low-stakes ones (Check-in).
const CATEGORY_ORDER = ['Renewal', 'QBR', 'Trial', 'Kickoff', 'Demo', 'Check-in', 'Other', 'Internal'];

// Purely text-based classification off Subject + notes — no Account/Opportunity
// cross-reference (Event↔Account/Opportunity matching in this org is fuzzy
// name-matching only, no reliable ID join).
function classifyMeeting(event) {
  const notes = parseMeetingNotes(event.Description) || '';
  const text = `${event.Subject || ''} ${notes}`.toLowerCase();
  const company = extractCompanyName(event);

  let category = 'Other';
  if (/renewal|renew\b/.test(text)) category = 'Renewal';
  else if (/\bqbr\b|quarterly business review/.test(text)) category = 'QBR';
  else if (/\bdemo\b/.test(text)) category = 'Demo';
  else if (/\btrial\b/.test(text)) category = 'Trial';
  else if (/kick[\s-]?off/.test(text)) category = 'Kickoff';
  else if (/check[\s-]?in|\bsync\b|touch\s?base/.test(text)) category = 'Check-in';
  else if (!company) category = 'Internal';

  // Only external (client/prospect) meetings count as "notable" — an internal
  // catch-up whose notes happen to mention e.g. a client's contract shouldn't
  // crowd out real client-facing renewal/negotiation meetings.
  const isNotable = category !== 'Internal' && /renewal|negotiat|contract|escalat|at[\s-]?risk|churn/.test(text);

  return { company, category, isNotable };
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

function CalendarGrid({ weekEvents, weekStart, onEventClick }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div>
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

// ── Week summary bar ──────────────────────────────────────────────────────────

function WeekSummary({ weekEvents, prevWeekEvents, selectedRep }) {
  const classified = useMemo(() => weekEvents.map((e) => ({ event: e, ...classifyMeeting(e) })), [weekEvents]);

  // One row per category, with the actual company names that fall into it —
  // so "25 Check-in" isn't a bare number disconnected from who's on it.
  const categoryGroups = useMemo(() => {
    const groups = new Map();
    classified.forEach(({ company, category }) => {
      if (!groups.has(category)) groups.set(category, { count: 0, companies: [] });
      const g = groups.get(category);
      g.count += 1;
      if (company && !g.companies.includes(company)) g.companies.push(company);
    });
    return [...groups.entries()]
      .map(([category, g]) => ({ category, ...g }))
      .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));
  }, [classified]);

  const notable = useMemo(() => {
    const seen = new Set();
    return classified
      .filter((c) => c.isNotable)
      .filter((c) => {
        const key = c.event.Subject || c.event.Id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 5);
  }, [classified]);

  const repLoad = useMemo(() => {
    if (selectedRep !== 'all') return [];
    const counts = new Map();
    weekEvents.forEach((e) => {
      const name = e.Owner?.Name || 'Unknown';
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [weekEvents, selectedRep]);

  const delta = weekEvents.length - prevWeekEvents.length;
  const trendLabel = delta > 0 ? `▲ +${delta} vs last week` : delta < 0 ? `▼ ${delta} vs last week` : '— flat vs last week';
  const trendColor = delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-rs-muted';

  return (
    <div className="rounded-card border border-rs-border bg-white p-4 mb-6">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <span className="text-sm font-semibold text-rs-text">
          {weekEvents.length} meeting{weekEvents.length !== 1 ? 's' : ''} this week
        </span>
        <span className={`text-xs font-medium ${trendColor}`}>{trendLabel}</span>
      </div>

      {/* Category breakdown — type and who's on it, together */}
      {categoryGroups.length > 0 ? (
        <div className="divide-y divide-rs-border/50 border border-rs-border rounded-lg overflow-hidden mb-3">
          {categoryGroups.map(({ category, companies }) => (
            <div key={category} className="flex items-center gap-2.5 px-3 py-1.5 bg-white">
              <span className="w-[74px] shrink-0">
                <span
                  className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${categoryStyle(category)}`}
                >
                  {category}
                </span>
              </span>
              {companies.length > 0 ? (
                <span className="text-xs text-rs-text">{companies.join(', ')}</span>
              ) : (
                <span className="text-xs text-rs-muted italic">No client tagged</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-rs-muted mb-3">No meetings this week</p>
      )}

      {/* Notable meetings */}
      {notable.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-rs-muted mb-1.5">Notable this week</p>
          <div className="space-y-1">
            {notable.map(({ event, company, category }) => (
              <div key={event.Id} className="flex items-center gap-2 text-xs">
                <span className="text-rs-muted w-8 shrink-0">
                  {event.StartDateTime ? format(new Date(event.StartDateTime), 'EEE') : ''}
                </span>
                <span className="text-rs-text truncate">{company || event.Subject || '—'}</span>
                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full border shrink-0 ${categoryStyle(category)}`}>
                  {category}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-rep load */}
      {repLoad.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-rs-muted mb-1.5">Meeting load by rep</p>
          <div className="flex flex-wrap gap-1">
            {repLoad.slice(0, 5).map(([name, count]) => (
              <span key={name} className="text-[10px] bg-rs-surface border border-rs-border text-rs-text px-2 py-0.5 rounded-full">
                {name} ({count})
              </span>
            ))}
            {repLoad.length > 5 && (
              <span className="text-[10px] text-rs-muted px-1 py-0.5">+{repLoad.length - 5} more</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { triggerRefresh, refreshCount, selectedRep } = useDashboard();
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

  const weekEvents = useMemo(() => {
    const weekEnd = addDays(weekStart, 7);
    return (filtered || []).filter((e) => {
      const d = e.StartDateTime ? new Date(e.StartDateTime) : null;
      return d && d >= weekStart && d < weekEnd;
    });
  }, [filtered, weekStart]);

  const prevWeekEvents = useMemo(() => {
    const prevStart = addDays(weekStart, -7);
    return (filtered || []).filter((e) => {
      const d = e.StartDateTime ? new Date(e.StartDateTime) : null;
      return d && d >= prevStart && d < weekStart;
    });
  }, [filtered, weekStart]);

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

      {/* Week summary */}
      <WeekSummary
        weekEvents={weekEvents}
        prevWeekEvents={prevWeekEvents}
        selectedRep={selectedRep}
      />

      {/* Calendar grid */}
      <div className="rounded-card border border-rs-border bg-white p-4">
        <CalendarGrid
          weekEvents={weekEvents}
          weekStart={weekStart}
          onEventClick={setSelectedEvent}
        />
      </div>
    </div>
  );
}
