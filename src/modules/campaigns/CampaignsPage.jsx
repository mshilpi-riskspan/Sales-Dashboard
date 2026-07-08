import { useState, useEffect, useMemo, useRef } from 'react';
import { format, differenceInDays, startOfYear, startOfQuarter, startOfMonth, startOfWeek } from 'date-fns';
import { ChevronDownIcon, ChevronUpIcon, CheckCircleIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { fetchCampaigns, fetchCampaignStatuses, fetchCampaignMembers, fetchCampaignOpportunities, fetchAccountDetail, fetchAccountActivities } from '../../datasources/salesforce';
import SlidePanel from '../../components/common/SlidePanel';
import DealDetailPanel from '../../components/common/DealDetailPanel';

// ── Per-status color styles (based on the actual SF CampaignMemberStatus labels) ─
const STATUS_STYLES = {
  Uncontacted:        { headerBg: 'bg-gray-50',   accentCls: 'text-gray-500',  dotCls: 'bg-gray-400',  badgeCls: 'bg-gray-100 text-gray-500' },
  Contacted:          { headerBg: 'bg-blue-50',   accentCls: 'text-blue-600',  dotCls: 'bg-blue-400',  badgeCls: 'bg-blue-50 text-blue-600' },
  Connected:          { headerBg: 'bg-teal-50',   accentCls: 'text-rs-teal',   dotCls: 'bg-rs-teal',   badgeCls: 'bg-teal-50 text-rs-teal' },
  Engaged:            { headerBg: 'bg-teal-50',   accentCls: 'text-rs-teal',   dotCls: 'bg-rs-teal',   badgeCls: 'bg-teal-50 text-rs-teal' },
  'Form Engagement':  { headerBg: 'bg-teal-50',   accentCls: 'text-rs-teal',   dotCls: 'bg-rs-teal',   badgeCls: 'bg-teal-50 text-rs-teal' },
  'Form Fill':        { headerBg: 'bg-amber-50',  accentCls: 'text-amber-700', dotCls: 'bg-amber-400', badgeCls: 'bg-amber-50 text-amber-700' },
  'Form Fills':       { headerBg: 'bg-amber-50',  accentCls: 'text-amber-700', dotCls: 'bg-amber-400', badgeCls: 'bg-amber-50 text-amber-700' },
  'Demo Set':         { headerBg: 'bg-amber-50',  accentCls: 'text-amber-700', dotCls: 'bg-amber-400', badgeCls: 'bg-amber-50 text-amber-700' },
  'Credentials Sent': { headerBg: 'bg-amber-50',  accentCls: 'text-amber-700', dotCls: 'bg-amber-400', badgeCls: 'bg-amber-50 text-amber-700' },
  'Trial Requested':  { headerBg: 'bg-amber-50',  accentCls: 'text-amber-700', dotCls: 'bg-amber-400', badgeCls: 'bg-amber-50 text-amber-700' },
  Opportunity:        { headerBg: 'bg-green-50',  accentCls: 'text-green-700', dotCls: 'bg-green-500', badgeCls: 'bg-green-50 text-green-700' },
  Attended:           { headerBg: 'bg-green-50',  accentCls: 'text-green-700', dotCls: 'bg-green-500', badgeCls: 'bg-green-50 text-green-700' },
  Registered:         { headerBg: 'bg-green-50',  accentCls: 'text-green-700', dotCls: 'bg-green-500', badgeCls: 'bg-green-50 text-green-700' },
  Disqualified:       { headerBg: 'bg-red-50',    accentCls: 'text-red-600',   dotCls: 'bg-red-400',   badgeCls: 'bg-red-50 text-red-600' },
};
const DEFAULT_STYLE = { headerBg: 'bg-gray-50', accentCls: 'text-gray-500', dotCls: 'bg-gray-400', badgeCls: 'bg-gray-100 text-gray-500' };

function getStatusStyle(label) {
  return STATUS_STYLES[label] || DEFAULT_STYLE;
}

// ── Formatting helpers ───────────────────────────────────────────────────────
function relativeDate(dateStr) {
  if (!dateStr) return null;
  const days = differenceInDays(new Date(), new Date(dateStr));
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function formatARR(v) {
  if (!v && v !== 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

const TYPE_BADGE = {
  Cold: 'bg-gray-100 text-gray-500',
  Content: 'bg-blue-50 text-blue-600',
  Event: 'bg-purple-50 text-purple-600',
  'Demo Signup': 'bg-teal-50 text-rs-teal',
  'Existing Clients': 'bg-green-50 text-green-700',
  Other: 'bg-gray-100 text-gray-500',
};

const STATUS_BADGE = {
  'In Progress': 'bg-teal-50 text-rs-teal',
  Planned: 'bg-blue-50 text-blue-600',
  Completed: 'bg-gray-100 text-gray-500',
  Aborted: 'bg-red-50 text-red-600',
};

// ── Searchable campaign dropdown ─────────────────────────────────────────────
function CampaignDropdown({ campaigns, selectedId, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);
  const inputRef = useRef(null);

  const selected = campaigns.find(c => c.Id === selectedId);

  const filtered = useMemo(() => {
    if (!search.trim()) return campaigns;
    const q = search.toLowerCase();
    const matches = campaigns.filter(c => c.Name.toLowerCase().includes(q));
    // Sort: starts-with first, then contains
    return matches.sort((a, b) => {
      const aStarts = a.Name.toLowerCase().startsWith(q);
      const bStarts = b.Name.toLowerCase().startsWith(q);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return 0;
    });
  }, [campaigns, search]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  function select(id) {
    onChange(id);
    setOpen(false);
    setSearch('');
  }

  return (
    <div ref={ref} className="relative min-w-[420px] max-w-[620px]">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 border border-rs-border rounded-lg px-3 py-2 text-sm text-rs-text bg-white hover:border-rs-teal/60 focus:outline-none focus:ring-2 focus:ring-rs-teal/40 transition-colors"
      >
        <span className="truncate text-left flex-1">
          {selected ? selected.Name : 'Select campaign…'}
        </span>
        <ChevronDownIcon className={`h-4 w-4 text-rs-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-rs-border rounded-lg shadow-lg overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-rs-border">
            <MagnifyingGlassIcon className="h-3.5 w-3.5 text-rs-muted shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search campaigns…"
              className="flex-1 text-sm text-rs-text placeholder-rs-muted bg-transparent focus:outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-rs-muted hover:text-rs-text text-xs leading-none">✕</button>
            )}
          </div>

          {/* Options list */}
          <ul className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-sm text-rs-muted text-center">No campaigns match</li>
            ) : (
              filtered.map(c => {
                const count = (c.NumberOfContacts || 0) + (c.NumberOfLeads || 0);
                const isSelected = c.Id === selectedId;
                return (
                  <li key={c.Id}>
                    <button
                      onClick={() => select(c.Id)}
                      className={`w-full text-left px-3 py-2.5 text-sm hover:bg-rs-surface transition-colors flex items-center justify-between gap-3
                        ${isSelected ? 'bg-rs-teal/5 text-rs-teal font-medium' : 'text-rs-text'}`}
                    >
                      <span className="truncate">{c.Name}</span>
                      {count > 0 && (
                        <span className="text-[10px] text-rs-muted shrink-0">{count} contacts</span>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Skeleton loader ──────────────────────────────────────────────────────────
function Skeleton({ rows = 4 }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-9 rounded bg-rs-border animate-pulse"
          style={{ width: `${65 + (i % 3) * 12}%` }}
        />
      ))}
    </div>
  );
}

// ── Stage card — one per actual SF CampaignMemberStatus ──────────────────────
// Members are grouped by company so a company with 3 contacts shows once on the left.
function StageCard({ statusLabel, members, onCompanyClick }) {
  const [expanded, setExpanded] = useState(true);
  const style = getStatusStyle(statusLabel);

  // Group by company name, preserving insertion order
  const companyGroups = useMemo(() => {
    const map = new Map();
    for (const m of members) {
      const co = m.CompanyOrAccount || '—';
      if (!map.has(co)) map.set(co, []);
      map.get(co).push(m);
    }
    return Array.from(map.entries()); // [[companyName, [member, ...]], ...]
  }, [members]);

  return (
    <div className="rounded-card border border-rs-border bg-white overflow-hidden">
      <div className={`flex items-center justify-between px-4 py-3 border-b border-rs-border ${style.headerBg}`}>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${style.dotCls}`} />
          <h3 className={`text-sm font-semibold ${style.accentCls}`}>{statusLabel}</h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-rs-muted font-medium">
            {members.length} contact{members.length !== 1 ? 's' : ''}
            {companyGroups.length !== members.length && (
              <span className="ml-1">· {companyGroups.length} compan{companyGroups.length !== 1 ? 'ies' : 'y'}</span>
            )}
          </span>
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-rs-muted hover:text-rs-text transition-colors"
          >
            {expanded ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        members.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-rs-muted">No contacts in this stage</div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                {['Company', 'Contact', '✓'].map(h => (
                  <th key={h} className="bg-rs-teal text-white px-3 py-2 text-left text-xs font-semibold tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {companyGroups.map(([company, contacts]) =>
                contacts.map((m, idx) => (
                  <tr
                    key={m.Id}
                    onClick={() => onCompanyClick(contacts)}
                    className="border-b border-rs-border hover:bg-rs-surface cursor-pointer transition-colors"
                  >
                    {idx === 0 && (
                      <td className="px-3 py-2 align-top border-r border-rs-border/40" rowSpan={contacts.length}>
                        <span className="text-sm font-medium text-rs-text">{company}</span>
                        {contacts.length > 1 && (
                          <span className="ml-1.5 text-[10px] text-rs-muted">({contacts.length})</span>
                        )}
                      </td>
                    )}
                    <td className={`px-3 py-2 ${idx > 0 ? 'border-t border-rs-border/30' : ''}`}>
                      <div className="text-sm text-rs-text leading-tight">{m.Name}</div>
                      {m.Title && (
                        <div className="text-xs text-rs-muted leading-tight truncate max-w-[260px]">{m.Title}</div>
                      )}
                    </td>
                    <td className={`px-3 py-2 text-center w-8 ${idx > 0 ? 'border-t border-rs-border/30' : ''}`}>
                      {m.HasResponded && <CheckCircleIcon className="h-4 w-4 text-green-500 mx-auto" />}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )
      )}
    </div>
  );
}

// ── Panel helper components (mirrors DealDetailPanel) ───────────────────────

function SectionLabel({ children }) {
  return <h3 className="text-[10px] font-bold uppercase tracking-widest text-rs-muted mb-3">{children}</h3>;
}

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <span className="text-rs-muted shrink-0 w-28 text-xs">{label}</span>
      <span className="text-right text-xs text-rs-text">{children}</span>
    </div>
  );
}

function PanelSkeleton({ rows = 3 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-4 rounded bg-rs-border animate-pulse" style={{ width: `${60 + (i % 3) * 15}%` }} />
      ))}
    </div>
  );
}

function CadenceBar({ label, count, max }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] text-rs-muted w-16 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-rs-border overflow-hidden">
        <div className="h-full rounded-full bg-rs-teal transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-rs-text w-5 text-right">{count}</span>
    </div>
  );
}

function parseEmailBody(description, type) {
  if (!description) return { body: null, meta: null };
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
    return { body: body || null, meta: { to: toMatch ? toMatch[1].replace(/;/g, ' ·').trim() : null }, isEmail: true };
  }
  const replyIdx = raw.search(/\n[-_]{10,}|\nFrom:\s[A-Z]/);
  return { body: replyIdx > 0 ? raw.slice(0, replyIdx).trim() : raw, meta: null, isEmail: false };
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

function getBaseSubjectLocal(subject) {
  if (!subject) return '';
  return subject.replace(/^(re:|re:\s*re:|fw:|fwd:)\s*/gi, '').trim();
}

function groupActivitiesLocal(activities) {
  const emailGroups = new Map();
  const standalone = [];
  for (const a of activities) {
    if (a.Type === 'Email') {
      const base = getBaseSubjectLocal(a.Subject).toLowerCase();
      if (!emailGroups.has(base)) emailGroups.set(base, []);
      emailGroups.get(base).push(a);
    } else {
      standalone.push({ type: 'single', item: a, date: new Date(a.ActivityDate || a.StartDateTime || a.CreatedDate || 0) });
    }
  }
  const threads = [];
  for (const [, emails] of emailGroups) {
    emails.sort((a, b) => new Date(a.ActivityDate || a.CreatedDate || 0) - new Date(b.ActivityDate || b.CreatedDate || 0));
    threads.push({ type: emails.length > 1 ? 'thread' : 'single', item: emails.length > 1 ? emails : emails[0], date: new Date(emails[emails.length - 1].ActivityDate || emails[emails.length - 1].CreatedDate || 0) });
  }
  return [...threads, ...standalone].sort((a, b) => b.date - a.date);
}

const TYPE_META = {
  Email: { label: 'Email', color: 'bg-purple-50 text-purple-600' },
  Call: { label: 'Call', color: 'bg-rs-teal/10 text-rs-teal' },
  Meeting: { label: 'Meeting', color: 'bg-green-50 text-green-700' },
  Virtual_Meeting: { label: 'Virtual', color: 'bg-green-50 text-green-700' },
  Task: { label: 'Task', color: 'bg-rs-surface text-rs-muted' },
  Event: { label: 'Event', color: 'bg-orange-50 text-orange-600' },
};

function TypeBadge({ type }) {
  const meta = TYPE_META[type] || { label: type?.slice(0, 8) || '—', color: 'bg-rs-surface text-rs-muted' };
  return <span className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded ${meta.color} uppercase tracking-wide leading-none`}>{meta.label}</span>;
}

function ActivityItemLocal({ activity, compact = false, prevOwner = null }) {
  const [expanded, setExpanded] = useState(false);
  const date = activity.ActivityDate || activity.StartDateTime;
  const type = activity.Type || (activity._src === 'event' ? 'Event' : 'Task');
  const { body, meta, isEmail } = parseEmailBody(activity.Description, type);
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
        {body && (
          <div className="bg-rs-surface rounded-md px-2.5 py-2">
            <p className="text-[11px] text-rs-text leading-relaxed whitespace-pre-line">
              {expanded || !isLong ? body : `${body.slice(0, 160)}…`}
            </p>
            {isLong && <button onClick={() => setExpanded(e => !e)} className="text-[10px] text-rs-teal hover:underline mt-1">{expanded ? 'Show less' : 'Show more'}</button>}
          </div>
        )}
        {!body && <p className="text-[11px] text-rs-muted italic">No content</p>}
      </div>
    );
  }

  return (
    <div className="py-2.5 border-b border-rs-border/50 last:border-0">
      <div className="flex items-start justify-between gap-2 mb-0.5">
        <p className="text-xs font-medium text-rs-text leading-snug flex-1 min-w-0">{activity.Subject || '—'}</p>
        <div className="flex items-center gap-1 shrink-0">
          <TypeBadge type={type} />
          {intentMeta && <span className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded uppercase tracking-wide leading-none ${intentMeta.color}`}>{intentMeta.label}</span>}
        </div>
      </div>
      <p className="text-[10px] text-rs-muted mb-1.5">
        {date ? format(new Date(date), 'MMM d, yyyy') : '—'}
        {activity.Owner?.Name ? ` · ${activity.Owner.Name}` : ''}
      </p>
      {isEmail && meta?.to && <p className="text-[10px] text-rs-muted mb-1 truncate"><span className="font-medium">To:</span> {meta.to}</p>}
      {body && (
        <div className={isEmail ? 'bg-rs-surface rounded-md px-2.5 py-2 mt-1' : ''}>
          <p className="text-[11px] text-rs-text leading-relaxed whitespace-pre-line">{expanded || !isLong ? body : `${body.slice(0, 160)}…`}</p>
          {isLong && <button onClick={() => setExpanded(e => !e)} className="text-[10px] text-rs-teal hover:underline mt-1">{expanded ? 'Show less' : 'Show more'}</button>}
        </div>
      )}
    </div>
  );
}

function ActivityThreadLocal({ emails }) {
  const [open, setOpen] = useState(false);
  const first = emails[0];
  const last = emails[emails.length - 1];
  const baseSubject = getBaseSubjectLocal(first.Subject);
  const earliest = new Date(first.ActivityDate || first.CreatedDate || 0);
  const latest = new Date(last.ActivityDate || last.CreatedDate || 0);
  const sameDay = earliest.toDateString() === latest.toDateString();
  const dateRange = sameDay ? format(latest, 'MMM d, yyyy') : `${format(earliest, 'MMM d')} – ${format(latest, 'MMM d, yyyy')}`;

  return (
    <div className="border-b border-rs-border/50 last:border-0">
      <button onClick={() => setOpen(o => !o)} className="w-full text-left py-2.5 flex items-start gap-2 hover:bg-rs-surface/50 rounded transition-colors">
        <span className="text-rs-muted text-[10px] mt-0.5 shrink-0">{open ? '▼' : '▶'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <p className="text-xs font-medium text-rs-text leading-snug">{baseSubject || first.Subject || '—'}</p>
            <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded font-semibold leading-none uppercase tracking-wide">{emails.length} emails</span>
          </div>
          <p className="text-[10px] text-rs-muted">{dateRange}</p>
        </div>
      </button>
      {open && (
        <div className="pl-4 pb-2">
          {emails.map((e, i) => <ActivityItemLocal key={e.Id || i} activity={e} compact prevOwner={i > 0 ? emails[i - 1].Owner?.Name : null} />)}
        </div>
      )}
    </div>
  );
}

function ContactItemLocal({ contact }) {
  const name = [contact.FirstName, contact.LastName].filter(Boolean).join(' ');
  return (
    <div className="flex items-start gap-3 py-2 border-b border-rs-border/50 last:border-0">
      <div className="shrink-0 w-7 h-7 rounded-full bg-rs-teal/15 text-rs-teal flex items-center justify-center text-[11px] font-semibold">
        {(contact.FirstName?.[0] || '?')}{(contact.LastName?.[0] || '')}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-rs-text leading-tight">{name}</p>
        {contact.Title && <p className="text-[10px] text-rs-muted mt-0.5 leading-snug">{contact.Title}</p>}
        {contact.Email && <a href={`mailto:${contact.Email}`} className="text-[10px] text-rs-teal hover:underline mt-0.5 block truncate">{contact.Email}</a>}
      </div>
      {contact.Phone && <a href={`tel:${contact.Phone}`} className="text-[10px] text-rs-muted hover:text-rs-teal shrink-0 mt-0.5">{contact.Phone}</a>}
    </div>
  );
}

function computeCadenceLocal(activities) {
  const now = new Date();
  const yearStart = startOfYear(now);
  const quarterStart = startOfQuarter(now);
  const monthStart = startOfMonth(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const getDate = (a) => new Date(a.ActivityDate || a.StartDateTime || a.CreatedDate || 0);
  return {
    ytd: activities.filter(a => getDate(a) >= yearStart).length,
    qtd: activities.filter(a => getDate(a) >= quarterStart).length,
    mtd: activities.filter(a => getDate(a) >= monthStart).length,
    wk:  activities.filter(a => getDate(a) >= weekStart).length,
  };
}

// ── Company detail slide panel — shows all contacts + unified activity feed ───
function MemberPanel({ companyMembers, campaignOpps, onClose, onDealClick }) {
  const [account, setAccount] = useState(null);
  const [activities, setActivities] = useState(null);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [loadingActivities, setLoadingActivities] = useState(false);

  const primaryMember = companyMembers?.[0];
  const accountId = primaryMember?.Contact?.AccountId || primaryMember?.AccountId || null;
  const companyName = primaryMember?.CompanyOrAccount || '—';

  useEffect(() => {
    if (!primaryMember) return;
    setAccount(null);
    setActivities(null);

    if (accountId) {
      setLoadingAccount(true);
      fetchAccountDetail(accountId)
        .then(setAccount).catch(() => setAccount({})).finally(() => setLoadingAccount(false));

      setLoadingActivities(true);
      fetchAccountActivities(accountId)
        .then(({ tasks: t, events: e }) => {
          const merged = [
            ...t.map(x => ({ ...x, _src: 'task' })),
            ...e.map(x => ({ ...x, _src: 'event' })),
          ].sort((a, b) => new Date(b.ActivityDate || b.StartDateTime || 0) - new Date(a.ActivityDate || a.StartDateTime || 0));
          setActivities(merged);
        })
        .catch(() => setActivities([]))
        .finally(() => setLoadingActivities(false));
    }
  }, [primaryMember?.Id]);

  if (!primaryMember) return null;

  const companyKey = companyName.toLowerCase().split(/[\s,]/)[0];
  const linkedOpp = companyKey
    ? campaignOpps.find(o => o.Account?.Name?.toLowerCase().includes(companyKey))
    : null;

  const cadence = activities ? computeCadenceLocal(activities) : null;
  const groupedActivities = activities ? groupActivitiesLocal(activities) : null;
  const cadenceMax = cadence?.ytd || 1;

  return (
    <SlidePanel
      open
      onClose={onClose}
      title={companyName}
      subtitle={`${companyMembers.length} contact${companyMembers.length !== 1 ? 's' : ''} in this campaign`}
      width={560}
    >
      <div className="p-5 space-y-6">

        {/* All contacts at this company */}
        <section>
          <SectionLabel>Contacts ({companyMembers.length})</SectionLabel>
          <div className="divide-y divide-rs-border/50">
            {companyMembers.map(m => {
              const s = getStatusStyle(m.Status);
              return (
                <div key={m.Id} className="py-2.5 flex items-start gap-3">
                  <div className="shrink-0 w-7 h-7 rounded-full bg-rs-teal/15 text-rs-teal flex items-center justify-center text-[11px] font-semibold mt-0.5">
                    {(m.FirstName?.[0] || m.Name?.[0] || '?')}{(m.LastName?.[0] || '')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-rs-text leading-tight">{m.Name}</p>
                    {m.Title && <p className="text-[10px] text-rs-muted mt-0.5">{m.Title}</p>}
                    {m.Email && <p className="text-[10px] text-rs-teal mt-0.5 truncate">{m.Email}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${s.badgeCls}`}>
                      {m.Status}
                    </span>
                    {m.HasResponded && (
                      <p className="text-[10px] text-green-600 mt-1">✓ Responded</p>
                    )}
                    {m.FirstRespondedDate && (
                      <p className="text-[10px] text-rs-muted mt-0.5">{relativeDate(m.FirstRespondedDate)}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Linked opportunity */}
        {linkedOpp && (
          <section>
            <SectionLabel>Open Opportunity</SectionLabel>
            <button
              onClick={() => onDealClick(linkedOpp)}
              className="w-full text-left rounded border border-rs-border bg-rs-surface hover:bg-[#E8EBF2] transition-colors px-3 py-2.5"
            >
              <div className="text-sm font-medium text-rs-text">{linkedOpp.Account?.Name}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs bg-rs-teal/10 text-rs-teal px-2 py-0.5 rounded-full font-medium">{linkedOpp.StageName}</span>
                <span className="text-xs text-rs-muted">{formatARR(linkedOpp.Annual_Recurring_Revenue_ARR__c ?? linkedOpp.Amount)}</span>
              </div>
            </button>
          </section>
        )}

        {/* Company info */}
        <section>
          <SectionLabel>Company</SectionLabel>
          {!accountId ? (
            <p className="text-xs text-rs-muted">No linked account</p>
          ) : loadingAccount ? (
            <PanelSkeleton rows={4} />
          ) : account ? (
            <div className="divide-y divide-rs-border/50">
              {account.Industry && <Row label="Industry">{account.Industry}</Row>}
              {account.Type && <Row label="Type">{account.Type}</Row>}
              {(account.BillingCity || account.BillingState) && (
                <Row label="Location">{[account.BillingCity, account.BillingState].filter(Boolean).join(', ')}</Row>
              )}
              {account.Website && (
                <Row label="Website">
                  <a href={account.Website} target="_blank" rel="noopener noreferrer" className="text-rs-teal hover:underline max-w-[180px] truncate block">
                    {account.Website.replace(/^https?:\/\//, '')}
                  </a>
                </Row>
              )}
              {account.Phone && <Row label="Phone">{account.Phone}</Row>}
              {account.AnnualRevenue > 0 && <Row label="Revenue">{formatARR(account.AnnualRevenue)}</Row>}
              {account.Owner?.Name && <Row label="Account Owner">{account.Owner.Name}</Row>}
              {account.Description && <div className="pt-2 text-xs text-rs-muted leading-relaxed line-clamp-4">{account.Description}</div>}
            </div>
          ) : (
            <p className="text-xs text-rs-muted">No account data</p>
          )}
        </section>

        {/* Activity cadence */}
        {cadence && (
          <section>
            <SectionLabel>Activity Cadence (YTD)</SectionLabel>
            <div className="space-y-2.5">
              <CadenceBar label="This Year" count={cadence.ytd} max={cadenceMax} />
              <CadenceBar label="This Qtr"  count={cadence.qtd} max={cadenceMax} />
              <CadenceBar label="This Mo"   count={cadence.mtd} max={cadenceMax} />
              <CadenceBar label="This Week" count={cadence.wk}  max={cadenceMax} />
            </div>
          </section>
        )}

        {/* Activity feed — account-level, shows all communications with this company */}
        <section>
          <SectionLabel>All Communications</SectionLabel>
          {!accountId ? (
            <p className="text-xs text-rs-muted">No linked account</p>
          ) : loadingActivities ? (
            <PanelSkeleton rows={3} />
          ) : groupedActivities?.length ? (
            <div>
              {groupedActivities.map((entry, i) =>
                entry.type === 'thread'
                  ? <ActivityThreadLocal key={i} emails={entry.item} />
                  : <ActivityItemLocal key={entry.item.Id || i} activity={entry.item} />
              )}
            </div>
          ) : (
            <p className="text-xs text-rs-muted">No activity found this year</p>
          )}
        </section>

      </div>
    </SlidePanel>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [campaignError, setCampaignError] = useState(null);

  const [selectedId, setSelectedId] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [members, setMembers] = useState([]);
  const [opps, setOpps] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [activeCompanyMembers, setActiveCompanyMembers] = useState(null);
  const [activeDeal, setActiveDeal] = useState(null);

  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState('All');
  const [oppsExpanded, setOppsExpanded] = useState(true);

  // Load all campaigns on mount
  useEffect(() => {
    fetchCampaigns()
      .then(data => {
        setCampaigns(data);
        const first = data.find(c => c.IsActive) || data[0];
        if (first) setSelectedId(first.Id);
      })
      .catch(err => setCampaignError(err.message))
      .finally(() => setLoadingCampaigns(false));
  }, []);

  // Load members + opps when campaign changes
  useEffect(() => {
    if (!selectedId) return;
    setLoadingDetail(true);
    setStatuses([]);
    setMembers([]);
    setOpps([]);
    setActiveCompanyMembers(null);
    setActiveDeal(null);
    Promise.all([
      fetchCampaignStatuses(selectedId),
      fetchCampaignMembers(selectedId),
      fetchCampaignOpportunities(selectedId),
    ])
      .then(([s, m, o]) => { setStatuses(s); setMembers(m); setOpps(o); })
      .finally(() => setLoadingDetail(false));
  }, [selectedId]);

  const selectedCampaign = useMemo(
    () => campaigns.find(c => c.Id === selectedId),
    [campaigns, selectedId]
  );

  // Campaigns matching current filters (for the dropdown)
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter(c => {
      if (showActiveOnly && !c.IsActive) return false;
      if (typeFilter !== 'All' && c.Type !== typeFilter) return false;
      return true;
    });
  }, [campaigns, showActiveOnly, typeFilter]);

  // Unique types from all campaigns
  const campaignTypes = useMemo(() => {
    const types = new Set(campaigns.map(c => c.Type).filter(Boolean));
    return ['All', ...Array.from(types).sort()];
  }, [campaigns]);

  // Group members by their exact SF status label
  const membersByStatus = useMemo(() => {
    const groups = {};
    for (const m of members) {
      if (!groups[m.Status]) groups[m.Status] = [];
      groups[m.Status].push(m);
    }
    return groups;
  }, [members]);

  if (campaignError) {
    return (
      <div className="rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Failed to load campaigns: {campaignError}
      </div>
    );
  }

  return (
    <div>
      {/* ── Selector bar ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {loadingCampaigns ? (
          <div className="h-9 w-72 rounded-lg bg-rs-border animate-pulse" />
        ) : (
          <CampaignDropdown
            campaigns={filteredCampaigns}
            selectedId={selectedId}
            onChange={setSelectedId}
          />
        )}

        <label className="flex items-center gap-1.5 text-sm text-rs-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showActiveOnly}
            onChange={e => setShowActiveOnly(e.target.checked)}
            className="accent-rs-teal"
          />
          Active only
        </label>

        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="border border-rs-border rounded-lg px-3 py-2 text-sm text-rs-text bg-white
                     focus:outline-none focus:ring-2 focus:ring-rs-teal/40"
        >
          {campaignTypes.map(t => (
            <option key={t} value={t}>{t === 'All' ? 'All Types' : t}</option>
          ))}
        </select>

        <span className="text-xs text-rs-muted ml-auto">
          {filteredCampaigns.length} campaign{filteredCampaigns.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Campaign summary strip ───────────────────────────────────────────── */}
      {selectedCampaign && (
        <div className="bg-rs-surface border border-rs-border rounded-card px-5 py-4 mb-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-rs-text truncate">{selectedCampaign.Name}</h2>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                {selectedCampaign.Type && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_BADGE[selectedCampaign.Type] || 'bg-gray-100 text-gray-500'}`}>
                    {selectedCampaign.Type}
                  </span>
                )}
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[selectedCampaign.Status] || 'bg-gray-100 text-gray-500'}`}>
                  {selectedCampaign.Status}
                </span>
                {selectedCampaign.Owner?.Name && (
                  <span className="text-xs text-rs-muted">{selectedCampaign.Owner.Name}</span>
                )}
              </div>
              {selectedCampaign.Campaign_Industry__c && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedCampaign.Campaign_Industry__c.split(';').map(ind => (
                    <span key={ind} className="text-xs bg-rs-teal/10 text-rs-teal px-2 py-0.5 rounded-full">
                      {ind.trim()}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="flex gap-6 shrink-0">
              <div className="text-center">
                <div className="text-xl font-bold text-rs-text">
                  {selectedCampaign.NumberOfContacts + selectedCampaign.NumberOfLeads}
                </div>
                <div className="text-xs text-rs-muted">Contacts</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-rs-text">{selectedCampaign.NumberOfOpportunities}</div>
                <div className="text-xs text-rs-muted">Opps</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-rs-text">{selectedCampaign.NumberOfWonOpportunities}</div>
                <div className="text-xs text-rs-muted">Won</div>
              </div>
              {selectedCampaign.AmountWonOpportunities > 0 && (
                <div className="text-center">
                  <div className="text-xl font-bold text-rs-teal">
                    {formatARR(selectedCampaign.AmountWonOpportunities)}
                  </div>
                  <div className="text-xs text-rs-muted">ARR Won</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Stage cards — one per SF CampaignMemberStatus, full-width stacked ─ */}
      {loadingDetail ? (
        <div className="space-y-4 mb-5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="rounded-card border border-rs-border bg-white overflow-hidden">
              <Skeleton rows={4} />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4 mb-5">
          {statuses.map(s => (
            <StageCard
              key={s.Id}
              statusLabel={s.Label}
              members={membersByStatus[s.Label] || []}
              onCompanyClick={setActiveCompanyMembers}
            />
          ))}
        </div>
      )}

      {/* ── Linked opportunities ─────────────────────────────────────────────── */}
      {opps.length > 0 && (
        <div className="rounded-card border border-rs-border bg-white overflow-hidden mb-5">
          <button
            onClick={() => setOppsExpanded(e => !e)}
            className="w-full flex items-center justify-between px-4 py-3 bg-rs-surface border-b border-rs-border hover:bg-[#E8EBF2] transition-colors"
          >
            <h3 className="text-sm font-semibold text-rs-text">
              Deals from this Campaign
              <span className="ml-2 text-xs font-normal text-rs-muted">({opps.length})</span>
            </h3>
            {oppsExpanded
              ? <ChevronUpIcon className="h-4 w-4 text-rs-muted" />
              : <ChevronDownIcon className="h-4 w-4 text-rs-muted" />}
          </button>

          {oppsExpanded && (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  {['Account', 'Opportunity', 'Stage', 'ARR', 'Owner'].map(h => (
                    <th
                      key={h}
                      className="bg-rs-teal text-white px-3 py-2 text-left text-xs font-semibold tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {opps.map(opp => (
                  <tr
                    key={opp.Id}
                    onClick={() => setActiveDeal(opp)}
                    className="border-b border-rs-border hover:bg-rs-surface cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2 text-sm font-medium text-rs-text">
                      {opp.Account?.Name || '—'}
                    </td>
                    <td className="px-3 py-2 text-sm text-rs-muted max-w-[200px] truncate">
                      {opp.Name}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-xs bg-rs-teal/10 text-rs-teal px-2 py-0.5 rounded-full font-medium">
                        {opp.StageName}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm font-medium text-rs-text">
                      {formatARR(opp.Annual_Recurring_Revenue_ARR__c ?? opp.Amount)}
                    </td>
                    <td className="px-3 py-2 text-sm text-rs-muted">
                      {opp.Owner?.Name || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Panels ───────────────────────────────────────────────────────────── */}
      {activeCompanyMembers && !activeDeal && (
        <MemberPanel
          companyMembers={activeCompanyMembers}
          campaignOpps={opps}
          onClose={() => setActiveCompanyMembers(null)}
          onDealClick={deal => { setActiveDeal(deal); }}
        />
      )}

      {activeDeal && (
        <DealDetailPanel
          deal={activeDeal}
          onClose={() => {
            setActiveDeal(null);
          }}
        />
      )}
    </div>
  );
}
