import { useState } from 'react';
import { format } from 'date-fns';
import SlidePanel from '../../components/common/SlidePanel';

// ── Rich activity feed (relocated from AccountView.jsx — same markup, now
// behind a click instead of always-expanded on the page) ────────────────────

function parseActivityBody(description, type) {
  if (!description) return { body: null, meta: null, isEmail: false };
  const raw = description.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const isEmail = type === 'Email' || /^To:\s|Body:\s/.test(raw);
  if (isEmail) {
    const toMatch = raw.match(/^To:\s*([^\n]+?)(?:\s+CC:|$)/m);
    const bodyMatch = raw.match(/Body:\s*([\s\S]*?)(?:\n(?:From:|Sent:|[-_]{10,})|\s*$)/);
    let body = bodyMatch ? bodyMatch[1].trim() : null;
    if (body) {
      body = body.replace(/^External Email:.*?(?=\n\n|\n[A-Z]|[A-Z][a-z]{2,}\s+\/)/s, '').trim();
      body = body.replace(/\n[-_]{3,}[\s\S]*/m, '').trim();
    }
    const to = toMatch ? toMatch[1].replace(/;/g, ' ·').trim() : null;
    return { body: body || null, meta: { to }, isEmail: true };
  }
  const replyIdx = raw.search(/\n[-_]{10,}|\nFrom:\s[A-Z]/);
  const body = replyIdx > 0 ? raw.slice(0, replyIdx).trim() : raw;
  return { body, meta: null, isEmail: false };
}

const INTENT_META = {
  Outreach:    { label: 'Outreach',   color: 'bg-amber-50 text-amber-700' },
  Intro:       { label: 'Intro',      color: 'bg-blue-50 text-blue-600' },
  'Follow-up': { label: 'Follow-up',  color: 'bg-orange-50 text-orange-600' },
  Meeting:     { label: 'Meeting',    color: 'bg-green-50 text-green-700' },
  Reply:       { label: 'Reply',      color: 'bg-rs-surface text-rs-muted' },
};

function getIntentTag(subject) {
  if (!subject) return null;
  const s = subject.toLowerCase();
  if (/^re:/i.test(subject)) return 'Reply';
  if (s.includes('outreach') || s.includes('reaching out')) return 'Outreach';
  if (s.includes('intro') || s.includes('introduction')) return 'Intro';
  if (s.includes('follow up') || s.includes('follow-up') || s.includes('followup') || s.includes('checking in')) return 'Follow-up';
  if (s.includes('meeting') || s.includes('demo') || s.includes('sync') || s.includes('connect') || /\bcall\b/.test(s)) return 'Meeting';
  return null;
}

function getBaseSubject(subject) {
  if (!subject) return '';
  return subject.replace(/^(re:|re:\s*re:|fw:|fwd:)\s*/gi, '').trim();
}

const TYPE_META = {
  Email:           { label: 'Email',   color: 'bg-purple-50 text-purple-600' },
  Call:            { label: 'Call',    color: 'bg-rs-teal/10 text-rs-teal' },
  Meeting:         { label: 'Meeting', color: 'bg-green-50 text-green-700' },
  Virtual_Meeting: { label: 'Virtual', color: 'bg-green-50 text-green-700' },
  VIRTUAL_MEETING: { label: 'Virtual', color: 'bg-green-50 text-green-700' },
  Task:            { label: 'Task',    color: 'bg-rs-surface text-rs-muted' },
  Event:           { label: 'Event',   color: 'bg-orange-50 text-orange-600' },
};

function TypeBadge({ type }) {
  const meta = TYPE_META[type] || { label: type?.slice(0, 8) || '—', color: 'bg-rs-surface text-rs-muted' };
  return (
    <span className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded uppercase tracking-wide leading-none ${meta.color}`}>
      {meta.label}
    </span>
  );
}

function RichActivityItem({ activity, compact = false, prevOwner = null }) {
  const [expanded, setExpanded] = useState(false);
  const date = activity.ActivityDate || activity.StartDateTime;
  const type = activity.Type || (activity._type === 'event' ? 'Event' : 'Task');
  const { body, meta, isEmail } = parseActivityBody(activity.Description, type);
  const isLong = body && body.length > 160;
  const intent = type === 'Email' ? getIntentTag(activity.Subject) : null;
  const intentMeta = intent ? INTENT_META[intent] : null;
  const ownerChanged = activity.Owner?.Name && activity.Owner.Name !== prevOwner;

  if (compact) {
    return (
      <div className="py-2 border-b border-rs-border/30 last:border-0">
        <p className="text-[10px] text-rs-muted mb-1">
          {date ? format(new Date(date), 'MMM d, yyyy') : '—'}
          {ownerChanged && activity.Owner?.Name ? ` · ${activity.Owner.Name}` : ''}
        </p>
        {isEmail && meta?.to && (
          <p className="text-[10px] text-rs-muted mb-1 truncate"><span className="font-medium">To:</span> {meta.to}</p>
        )}
        {body ? (
          <div className="bg-rs-surface rounded-md px-2.5 py-2">
            <p className="text-[11px] text-rs-text leading-relaxed whitespace-pre-line">
              {expanded || !isLong ? body : `${body.slice(0, 160)}…`}
            </p>
            {isLong && (
              <button onClick={() => setExpanded(e => !e)} className="text-[10px] text-rs-teal hover:underline mt-1">
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        ) : <p className="text-[11px] text-rs-muted italic">No content</p>}
      </div>
    );
  }

  return (
    <div className="py-2.5 border-b border-rs-border/50 last:border-0">
      <div className="flex items-start justify-between gap-2 mb-0.5">
        <p className="text-xs font-medium text-rs-text leading-snug flex-1 min-w-0">{activity.Subject || '—'}</p>
        <div className="flex items-center gap-1 shrink-0">
          <TypeBadge type={type} />
          {intentMeta && (
            <span className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded uppercase tracking-wide leading-none ${intentMeta.color}`}>
              {intentMeta.label}
            </span>
          )}
        </div>
      </div>
      <p className="text-[10px] text-rs-muted mb-1.5">
        {date ? format(new Date(date), 'MMM d, yyyy') : '—'}
        {activity.Owner?.Name ? ` · ${activity.Owner.Name}` : ''}
      </p>
      {isEmail && meta?.to && (
        <p className="text-[10px] text-rs-muted mb-1 truncate"><span className="font-medium">To:</span> {meta.to}</p>
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

function ActivityThread({ emails }) {
  const [open, setOpen] = useState(false);
  const first = emails[0];
  const last = emails[emails.length - 1];
  const baseSubject = getBaseSubject(first.Subject);
  const earliest = new Date(first.ActivityDate || first.CreatedDate || 0);
  const latest = new Date(last.ActivityDate || last.CreatedDate || 0);
  const sameDay = earliest.toDateString() === latest.toDateString();
  const dateRange = sameDay
    ? format(latest, 'MMM d, yyyy')
    : `${format(earliest, 'MMM d')} – ${format(latest, 'MMM d, yyyy')}`;

  return (
    <div className="border-b border-rs-border/50 last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left py-2.5 flex items-start gap-2 hover:bg-rs-surface/50 rounded transition-colors"
      >
        <span className="text-rs-muted text-[10px] mt-0.5 shrink-0">{open ? '▼' : '▶'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <p className="text-xs font-medium text-rs-text leading-snug">{baseSubject || first.Subject || '—'}</p>
            <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded font-semibold leading-none uppercase tracking-wide">
              {emails.length} emails
            </span>
          </div>
          <p className="text-[10px] text-rs-muted">{dateRange}</p>
        </div>
      </button>
      {open && (
        <div className="pl-4 pb-2">
          {emails.map((e, i) => (
            <RichActivityItem key={e.Id || i} activity={e} compact prevOwner={i > 0 ? emails[i - 1].Owner?.Name : null} />
          ))}
        </div>
      )}
    </div>
  );
}

function groupActivities(activities) {
  const emailGroups = new Map();
  const standalone = [];
  for (const a of activities) {
    if (a.Type === 'Email') {
      const base = getBaseSubject(a.Subject).toLowerCase();
      if (!emailGroups.has(base)) emailGroups.set(base, []);
      emailGroups.get(base).push(a);
    } else {
      standalone.push({ type: 'single', item: a, date: new Date(a.ActivityDate || a.StartDateTime || a.CreatedDate || 0) });
    }
  }
  const threads = [];
  for (const [, emails] of emailGroups) {
    emails.sort((a, b) => new Date(a.ActivityDate || a.CreatedDate || 0) - new Date(b.ActivityDate || b.CreatedDate || 0));
    threads.push({
      type: emails.length > 1 ? 'thread' : 'single',
      item: emails.length > 1 ? emails : emails[0],
      date: new Date(emails[emails.length - 1].ActivityDate || emails[emails.length - 1].CreatedDate || 0),
    });
  }
  return [...threads, ...standalone].sort((a, b) => b.date - a.date);
}

export default function ActivityListPanel({ activities, onClose }) {
  const grouped = activities ? groupActivities(activities) : [];
  return (
    <SlidePanel
      open={!!activities}
      onClose={onClose}
      title="Activity & Engagement"
      subtitle={`${activities?.length || 0} activit${activities?.length === 1 ? 'y' : 'ies'} this year`}
      width={520}
    >
      <div className="p-4">
        {grouped.length === 0 ? (
          <p className="text-xs text-rs-muted">No activity recorded this year.</p>
        ) : (
          <div>
            {grouped.map((entry, i) =>
              entry.type === 'thread' ? (
                <ActivityThread key={i} emails={entry.item} />
              ) : (
                <RichActivityItem key={entry.item?.Id || i} activity={entry.item} />
              )
            )}
          </div>
        )}
      </div>
    </SlidePanel>
  );
}
