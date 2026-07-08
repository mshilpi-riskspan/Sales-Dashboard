import { useState, useMemo } from 'react';
import { format, startOfWeek, addDays, isSameDay, isToday, differenceInMinutes } from 'date-fns';

function parseEmailBody(description, type) {
  if (!description) return { body: null, meta: null };
  const raw = description.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const isEmail = type === 'Email' || /^To:\s|Body:\s/.test(raw);
  if (isEmail) {
    const toMatch = raw.match(/^To:\s*([^\n]+?)(?:\s+CC:|$)/m);
    const subjectMatch = raw.match(/Subject:\s*([^\n]+?)(?:\s+Body:|$)/m);
    const bodyMatch = raw.match(/Body:\s*([\s\S]*?)(?:\n(?:From:|Sent:|[-_]{10,})|\s*$)/);
    let body = bodyMatch ? bodyMatch[1].trim() : null;
    if (body) {
      body = body.replace(/^External Email:.*?(?=\n\n|\n[A-Z]|[A-Z][a-z]{2,}\s+\/)/s, '').trim();
      body = body.replace(/\n[-_]{3,}[\s\S]*/m, '').trim();
    }
    return {
      body: body || null,
      meta: {
        to: toMatch ? toMatch[1].replace(/;/g, ' ·').trim() : null,
        subject: subjectMatch ? subjectMatch[1].trim() : null,
      },
      isEmail: true,
    };
  }
  const replyIdx = raw.search(/\n[-_]{10,}|\nFrom:\s[A-Z]/);
  return { body: replyIdx > 0 ? raw.slice(0, replyIdx).trim() : raw, meta: null, isEmail: false };
}
import SlidePanel from '../../components/common/SlidePanel';

function formatARR(v) {
  if (!v && v !== 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

// ─── Opps table (unchanged) ────────────────────────────────────────────────

function OppsTable({ records, onDealClick }) {
  const sorted = [...(records || [])].sort(
    (a, b) => (b.Annual_Recurring_Revenue_ARR__c ?? b.Amount ?? 0) - (a.Annual_Recurring_Revenue_ARR__c ?? a.Amount ?? 0)
  );
  return (
    <table className="w-full">
      <thead>
        <tr className="text-rs-muted uppercase tracking-wide text-[10px] border-b border-rs-border">
          <th className="text-left py-2 pr-3 font-semibold">Account</th>
          <th className="text-left py-2 pr-3 font-semibold">Stage</th>
          <th className="text-right py-2 pr-3 font-semibold">ARR</th>
          <th className="text-right py-2 font-semibold">Close</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((deal) => {
          const arr = deal.Annual_Recurring_Revenue_ARR__c ?? deal.Amount;
          const isPast = deal.CloseDate && new Date(deal.CloseDate + 'T00:00:00') < new Date();
          return (
            <tr
              key={deal.Id}
              onClick={() => onDealClick?.(deal)}
              className={`border-b border-rs-border transition-colors ${onDealClick ? 'hover:bg-rs-surface cursor-pointer' : ''}`}
            >
              <td className="py-2 pr-3 text-xs font-medium text-rs-text">{deal.Account?.Name || deal.Name || '—'}</td>
              <td className="py-2 pr-3 text-xs text-rs-muted">{deal.StageName}</td>
              <td className="py-2 pr-3 text-xs text-right font-semibold text-rs-text">{formatARR(arr)}</td>
              <td className={`py-2 text-xs text-right ${isPast ? 'text-rs-overdueText font-medium' : 'text-rs-muted'}`}>
                {deal.CloseDate ? format(new Date(deal.CloseDate + 'T00:00:00'), 'MMM d') : '—'}
              </td>
            </tr>
          );
        })}
        {!sorted.length && (
          <tr><td colSpan={4} className="py-6 text-center text-xs text-rs-muted">No records</td></tr>
        )}
      </tbody>
    </table>
  );
}

// ─── Tasks table — threaded email view ────────────────────────────────────

const INTENT_META = {
  Outreach:   { label: 'Outreach',   color: 'bg-amber-50 text-amber-700' },
  Intro:      { label: 'Intro',      color: 'bg-blue-50 text-blue-600' },
  'Follow-up': { label: 'Follow-up', color: 'bg-orange-50 text-orange-600' },
  Meeting:    { label: 'Meeting',    color: 'bg-green-50 text-green-700' },
  Reply:      { label: 'Reply',      color: 'bg-rs-surface text-rs-muted' },
};

function getIntentTag(subject) {
  if (!subject) return null;
  const raw = subject;
  const s = subject.toLowerCase();
  if (/^(re:|re: re:)/i.test(raw)) return 'Reply';
  if (s.includes('outreach') || s.includes('reaching out')) return 'Outreach';
  if (s.includes('intro') || s.includes('introduction')) return 'Intro';
  if (s.includes('follow up') || s.includes('follow-up') || s.includes('followup') || s.includes('checking in') || /\bfup\b/.test(s)) return 'Follow-up';
  if (s.includes('meeting') || s.includes('demo') || s.includes('sync') || s.includes('connect') || /\bcall\b/.test(s)) return 'Meeting';
  return null;
}

function getBaseSubject(subject) {
  if (!subject) return '';
  return subject.replace(/^(re:|re:\s*re:|fw:|fwd:)\s*/gi, '').trim();
}

function groupIntoThreads(records) {
  const groups = new Map();
  for (const r of records) {
    const base = getBaseSubject(r.Subject).toLowerCase();
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(r);
  }
  for (const [, emails] of groups) {
    emails.sort((a, b) => new Date(a.ActivityDate || a.CreatedDate || 0) - new Date(b.ActivityDate || b.CreatedDate || 0));
  }
  return [...groups.entries()]
    .map(([, emails]) => ({
      emails,
      latest: new Date(emails[emails.length - 1].ActivityDate || emails[emails.length - 1].CreatedDate || 0),
    }))
    .sort((a, b) => b.latest - a.latest);
}

function EmailBody({ record, compact = false }) {
  const [expanded, setExpanded] = useState(false);
  const { body, meta, isEmail } = parseEmailBody(record.Description, record.Type || 'Email');
  const isLong = body && body.length > 160;

  return (
    <div>
      {isEmail && meta?.to && (
        <p className="text-[10px] text-rs-muted mb-1 truncate">
          <span className="font-medium">To:</span> {meta.to}
        </p>
      )}
      {body && (
        <div className={isEmail ? 'bg-rs-surface rounded-md px-2.5 py-2 mt-1' : ''}>
          <p className="text-[11px] text-rs-text leading-relaxed whitespace-pre-line">
            {expanded || !isLong ? body : `${body.slice(0, 160)}…`}
          </p>
          {isLong && (
            <button onClick={() => setExpanded(e => !e)} className="text-[10px] text-rs-teal hover:underline mt-1">
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TaskItem({ record, compact = false, prevOwner = null }) {
  const date = record.ActivityDate || record.CreatedDate;
  const type = record.Type || 'Task';
  const intent = getIntentTag(record.Subject);
  const intentMeta = intent ? INTENT_META[intent] : null;
  const ownerChanged = record.Owner?.Name && record.Owner.Name !== prevOwner;

  if (compact) {
    return (
      <div className="py-2 border-b border-rs-border/30 last:border-0">
        <p className="text-[10px] text-rs-muted mb-1">
          {date ? format(new Date(date), 'MMM d, yyyy') : '—'}
          {ownerChanged && record.Owner?.Name ? ` · ${record.Owner.Name}` : ''}
        </p>
        <EmailBody record={record} compact />
      </div>
    );
  }

  return (
    <div className="py-3 border-b border-rs-border/50 last:border-0">
      <div className="flex items-start gap-2 mb-0.5">
        <p className="text-xs font-medium text-rs-text leading-snug flex-1 min-w-0">{record.Subject || '—'}</p>
        <div className="flex items-center justify-end gap-1 shrink-0 w-[130px]">
          {type === 'Email' && (
            <span className="inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded uppercase tracking-wide leading-none bg-purple-50 text-purple-600">
              Email
            </span>
          )}
          {type === 'Call' && (
            <span className="inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded uppercase tracking-wide leading-none bg-rs-teal/10 text-rs-teal">
              Call
            </span>
          )}
          {intentMeta && (
            <span className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded uppercase tracking-wide leading-none ${intentMeta.color}`}>
              {intentMeta.label}
            </span>
          )}
        </div>
      </div>
      {record.What?.Name && (
        <p className="text-[11px] font-medium text-rs-teal mb-0.5">{record.What.Name}</p>
      )}
      <p className="text-[10px] text-rs-muted mb-1.5">
        {date ? format(new Date(date), 'MMM d, yyyy') : '—'}
        {record.Owner?.Name ? ` · ${record.Owner.Name}` : ''}
      </p>
      <EmailBody record={record} />
    </div>
  );
}

function ThreadGroup({ thread }) {
  const [open, setOpen] = useState(false);
  const { emails, latest } = thread;
  const first = emails[0];
  const baseSubject = getBaseSubject(first.Subject);
  const company = emails.find(e => e.What?.Name)?.What?.Name || null;
  const earliest = new Date(first.ActivityDate || first.CreatedDate || 0);
  const sameDay = earliest.toDateString() === latest.toDateString();
  const dateRange = sameDay
    ? format(latest, 'MMM d, yyyy')
    : `${format(earliest, 'MMM d')} – ${format(latest, 'MMM d, yyyy')}`;

  if (emails.length === 1) return <TaskItem record={first} />;

  return (
    <div className="border-b border-rs-border/50 last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left py-3 flex items-start gap-2 hover:bg-rs-surface/50 rounded transition-colors"
      >
        <span className="text-rs-muted text-[10px] mt-0.5 shrink-0">{open ? '▼' : '▶'}</span>
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-rs-text leading-snug mb-0.5">{baseSubject || first.Subject || '—'}</p>
            {company && <p className="text-[11px] font-medium text-rs-teal">{company}</p>}
            <p className="text-[10px] text-rs-muted">{dateRange}</p>
          </div>
          <div className="flex items-center justify-end shrink-0 w-[130px]">
            <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded font-semibold leading-none uppercase tracking-wide">
              {emails.length} emails
            </span>
          </div>
        </div>
      </button>
      {open && (
        <div className="pl-5 pb-2">
          {emails.map((e, i) => (
            <TaskItem key={e.Id || i} record={e} compact prevOwner={i > 0 ? emails[i - 1].Owner?.Name : null} />
          ))}
        </div>
      )}
    </div>
  );
}

function TasksTable({ records }) {
  const threads = useMemo(() => groupIntoThreads(records || []), [records]);
  if (!threads.length) return <p className="py-6 text-center text-xs text-rs-muted">No records</p>;
  return (
    <div>
      {threads.map((thread, i) => <ThreadGroup key={i} thread={thread} />)}
    </div>
  );
}

// ─── Meetings calendar ─────────────────────────────────────────────────────

const CHIP_COLORS = {
  Virtual_meeting: 'bg-rs-teal/10 text-rs-teal border-rs-teal/20',
  VIRTUAL_MEETING: 'bg-rs-teal/10 text-rs-teal border-rs-teal/20',
  'Face-to-Face Meeting': 'bg-green-50 text-green-700 border-green-200',
  default: 'bg-rs-surface text-rs-muted border-rs-border',
};

function chipColor(type) {
  return CHIP_COLORS[type] || CHIP_COLORS.default;
}

// Extract company name from event — What.Name if linked, else parsed from subject.
// Handles patterns like "RS<>NYL - Weekly", "Santander - RiskSpan: Meeting",
// "RiskSpan<>PacLife - Connect", "Resolution Life with RiskSpan"
function extractCompanyName(event) {
  if (event.What?.Name) return event.What.Name;

  let subj = (event.Subject || '').replace(/^Following:\s*/i, '').trim();
  if (!subj) return null;

  const isRS = (s) => /\b(RiskSpan|RS)\b/i.test(s);

  // "X <> Y" — take the non-RS side
  const arrow = subj.match(/^(.+?)\s*<>\s*(.+?)(?:\s[-–]|$)/);
  if (arrow) {
    const a = arrow[1].trim();
    const b = arrow[2].replace(/\s*(Phase\s*\d+)?\s*[-–].*$/, '').trim();
    if (!isRS(a)) return a;
    if (!isRS(b)) return b;
  }

  // "X - RiskSpan..." or "X / RS..." or "X: RS..."
  const beforeRS = subj.match(/^(.+?)\s*[-–/:]\s*(?:RiskSpan|RS)\b/i);
  if (beforeRS) {
    const name = beforeRS[1].replace(/^\w[\w\s]+:\s*/, '').trim(); // strip "CONF CALL:" etc
    if (name) return name;
  }

  // "RiskSpan - X" or "RS - X" or "RiskSpan and X" or "Riskspan and X"
  const afterRS = subj.match(/(?:RiskSpan|RS)\s*(?:<>|[-–/]|(?:\s+and\s+))\s*(.+?)(?:\s[-–]|$)/i);
  if (afterRS) return afterRS[1].replace(/\s*(Phase\s*\d+)?$/, '').trim();

  // "X with RiskSpan"
  const withRS = subj.match(/^(.+?)\s+with\s+(?:RiskSpan|RS)\b/i);
  if (withRS) return withRS[1].trim();

  return null;
}

function parseMeetingNotes(description) {
  if (!description) return null;
  const raw = description.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  // Strip Teams/Zoom boilerplate
  const cleaned = raw.replace(/\n[-_]{3,}[\s\S]*/m, '').trim();
  return cleaned || null;
}

function formatDuration(start, end) {
  if (!start || !end) return null;
  const mins = differenceInMinutes(new Date(end), new Date(start));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function EventDetail({ event, onBack }) {
  const notes = parseMeetingNotes(event.Description);
  const duration = formatDuration(event.StartDateTime, event.EndDateTime);

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-rs-teal hover:underline mb-4"
      >
        ← Back to calendar
      </button>

      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-rs-text leading-snug">{event.Subject || '—'}</p>
          {event.What?.Name && (
            <p className="text-xs font-medium text-rs-teal mt-1">{event.What.Name}</p>
          )}
        </div>

        <div className="divide-y divide-rs-border/50 text-xs">
          {event.StartDateTime && (
            <div className="flex justify-between py-1.5">
              <span className="text-rs-muted">Date</span>
              <span className="text-rs-text font-medium">
                {format(new Date(event.StartDateTime), 'EEE, MMM d, yyyy')}
              </span>
            </div>
          )}
          {event.StartDateTime && (
            <div className="flex justify-between py-1.5">
              <span className="text-rs-muted">Time</span>
              <span className="text-rs-text">
                {format(new Date(event.StartDateTime), 'h:mm a')}
                {event.EndDateTime ? ` – ${format(new Date(event.EndDateTime), 'h:mm a')}` : ''}
                {duration ? <span className="text-rs-muted ml-1.5">({duration})</span> : null}
              </span>
            </div>
          )}
          {event.Type && (
            <div className="flex justify-between py-1.5">
              <span className="text-rs-muted">Type</span>
              <span className="text-rs-text">{event.Type.replace(/_/g, ' ')}</span>
            </div>
          )}
          {event.Owner?.Name && (
            <div className="flex justify-between py-1.5">
              <span className="text-rs-muted">Rep</span>
              <span className="text-rs-text">{event.Owner.Name}</span>
            </div>
          )}
        </div>

        {notes && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-rs-muted mb-2">Notes</p>
            <div className="bg-rs-surface rounded-lg px-3 py-2.5">
              <p className="text-xs text-rs-text leading-relaxed whitespace-pre-line">{notes}</p>
            </div>
          </div>
        )}
        {!notes && (
          <p className="text-xs text-rs-muted italic">No meeting notes recorded</p>
        )}
      </div>
    </div>
  );
}

function MeetingsCalendar({ records }) {
  const now = new Date();
  const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });

  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const [selectedEvent, setSelectedEvent] = useState(null);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEnd = addDays(weekStart, 7);

  const weekEvents = useMemo(() => {
    return (records || []).filter((e) => {
      const d = e.StartDateTime ? new Date(e.StartDateTime) : null;
      return d && d >= weekStart && d < weekEnd;
    });
  }, [records, weekStart]);

  const companies = useMemo(() => {
    const names = weekEvents.map((e) => extractCompanyName(e)).filter(Boolean);
    return [...new Set(names)];
  }, [weekEvents]);

  const isCurrentWeek = isSameDay(weekStart, currentWeekStart);
  const isFutureWeek = weekStart > currentWeekStart;

  if (selectedEvent) {
    return <EventDetail event={selectedEvent} onBack={() => setSelectedEvent(null)} />;
  }

  return (
    <div>
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setWeekStart((w) => addDays(w, -7))}
          className="p-1 rounded hover:bg-rs-surface text-rs-muted hover:text-rs-text transition-colors"
          aria-label="Previous week"
        >
          ‹
        </button>
        <span className="text-xs font-semibold text-rs-text">
          {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d, yyyy')}
        </span>
        <button
          onClick={() => setWeekStart((w) => addDays(w, 7))}
          disabled={isCurrentWeek || isFutureWeek}
          className="p-1 rounded hover:bg-rs-surface text-rs-muted hover:text-rs-text transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Next week"
        >
          ›
        </button>
      </div>

      {/* Companies summary strip */}
      <div className="mb-4 px-3 py-2 bg-rs-surface rounded-lg">
        <span className="text-[10px] font-bold uppercase tracking-widest text-rs-muted">
          {weekEvents.length} meeting{weekEvents.length !== 1 ? 's' : ''}
        </span>
        {companies.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {companies.slice(0, 5).map((c) => (
              <span key={c} className="text-[10px] bg-white border border-rs-border text-rs-text px-2 py-0.5 rounded-full">
                {c}
              </span>
            ))}
            {companies.length > 5 && (
              <span className="text-[10px] text-rs-muted px-1 py-0.5">+{companies.length - 5} more</span>
            )}
          </div>
        )}
        {companies.length === 0 && (
          <p className="text-[10px] text-rs-muted mt-0.5">No meetings this week</p>
        )}
      </div>

      {/* 7-day grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dayEvents = weekEvents.filter((e) =>
            e.StartDateTime && isSameDay(new Date(e.StartDateTime), day)
          );
          const today = isToday(day);
          return (
            <div key={day.toISOString()} className="flex flex-col min-h-[80px]">
              {/* Day header */}
              <div className={`text-center py-1 rounded-t mb-1 ${today ? 'bg-rs-teal text-white' : 'bg-rs-surface text-rs-muted'}`}>
                <p className="text-[9px] font-bold uppercase tracking-wide">{format(day, 'EEE')}</p>
                <p className={`text-xs font-semibold ${today ? 'text-white' : 'text-rs-text'}`}>{format(day, 'd')}</p>
              </div>
              {/* Event chips */}
              <div className="flex flex-col gap-0.5 flex-1">
                {dayEvents.length === 0 && (
                  <span className="text-[9px] text-rs-border text-center mt-2">—</span>
                )}
                {dayEvents.map((e) => (
                  <button
                    key={e.Id}
                    onClick={() => setSelectedEvent(e)}
                    className={`w-full text-left px-1 py-0.5 rounded border text-[9px] font-medium leading-tight truncate hover:opacity-80 transition-opacity ${chipColor(e.Type)}`}
                    title={e.Subject}
                  >
                    {e.What?.Name || e.Subject || '—'}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main panel ────────────────────────────────────────────────────────────

export default function KpiDrillPanel({ title, records, type, onClose, onDealClick }) {
  return (
    <SlidePanel
      open={!!records}
      onClose={onClose}
      title={title}
      subtitle={type === 'activities' ? undefined : `${records?.length || 0} record${records?.length !== 1 ? 's' : ''}`}
      width={type === 'activities' ? 620 : 520}
    >
      <div className="p-4">
        {type === 'opps' && <OppsTable records={records} onDealClick={onDealClick} />}
        {type === 'tasks' && <TasksTable records={records} />}
        {type === 'activities' && <MeetingsCalendar records={records} />}
      </div>
    </SlidePanel>
  );
}
