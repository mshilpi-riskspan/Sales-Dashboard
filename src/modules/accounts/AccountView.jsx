import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import {
  ArrowLeftIcon, MapPinIcon, GlobeAltIcon,
} from '@heroicons/react/24/outline';
import {
  fetchAccountDetail, fetchAccountContacts,
  fetchAccountActivities, fetchAccountOpportunities,
} from '../../datasources/salesforce';
import DealDetailPanel from '../../components/common/DealDetailPanel';
import { isClientTier } from '../../config/accountTier';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatARR(v) {
  if (!v) return '—';
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function relativeDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00' : dateStr);
  const diff = Math.floor((Date.now() - d) / 86400000);
  if (diff < 0) return 'Upcoming';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 30) return `${diff}d ago`;
  if (diff < 365) return `${Math.floor(diff / 30)}mo ago`;
  return `${Math.floor(diff / 365)}yr ago`;
}

function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-rs-surface rounded ${className}`} />;
}

function SectionLabel({ children }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-rs-muted mb-3">
      {children}
    </p>
  );
}

const STAGE_COLORS = {
  'Closed Won': 'bg-green-100 text-green-700',
  'Closed Lost': 'bg-red-100 text-red-600',
  'Trial': 'bg-amber-100 text-amber-700',
  'Proposal (Pricing) Delivered': 'bg-blue-100 text-blue-700',
  'Technical Fit Agreement': 'bg-teal-100 text-rs-teal',
  'Initial Demo / SQL': 'bg-purple-100 text-purple-700',
  'Negotiation & Decision Making': 'bg-orange-100 text-orange-700',
  'Contract Sent for Signature': 'bg-indigo-100 text-indigo-700',
};

function StageBadge({ stage }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STAGE_COLORS[stage] || 'bg-slate-100 text-slate-600'}`}>
      {stage}
    </span>
  );
}

// Copy of cadence/activity logic from DealDetailPanel (per plan: copy, don't refactor shared component)
function computeCadence(activities) {
  const { tasks = [], events = [] } = activities || {};
  const all = [
    ...tasks.map(t => t.ActivityDate),
    ...events.map(e => e.StartDateTime?.slice(0, 10)),
  ].filter(Boolean);
  const now = Date.now();
  const count = (days) => all.filter(d => (now - new Date(d + 'T00:00:00')) / 86400000 <= days).length;
  return { last7: count(7), last90: count(90), last365: count(365) };
}

function CadenceBar({ label, count, total }) {
  const pct = total > 0 ? Math.min((count / total) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-rs-muted w-14 shrink-0 text-right">{label}</span>
      <div className="flex-1 h-1.5 bg-rs-surface rounded-full overflow-hidden">
        <div className="h-full bg-rs-teal rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-rs-text w-5 text-right">{count}</span>
    </div>
  );
}

// ── Rich activity feed (copied from DealDetailPanel per plan) ────────────────

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

// ── Main Component ────────────────────────────────────────────────────────────

export default function AccountView({ accountId, onBack }) {
  const [account, setAccount] = useState(null);
  const [contacts, setContacts] = useState(null);
  const [activities, setActivities] = useState(null);
  const [opps, setOpps] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeDeal, setActiveDeal] = useState(null);

  useEffect(() => {
    setLoading(true);
    setAccount(null);
    setContacts(null);
    setActivities(null);
    setOpps(null);
    Promise.all([
      fetchAccountDetail(accountId),
      fetchAccountContacts(accountId),
      fetchAccountActivities(accountId),
      fetchAccountOpportunities(accountId),
    ]).then(([acct, ctcts, acts, oppsData]) => {
      setAccount(acct);
      setContacts(ctcts);
      setActivities(acts);
      setOpps(oppsData);
      setLoading(false);
    });
  }, [accountId]);

  const cadence = computeCadence(activities);
  const allActivities = [
    ...(activities?.tasks || []).map(t => ({ ...t, _type: 'task' })),
    ...(activities?.events || []).map(e => ({ ...e, _type: 'event' })),
  ].sort((a, b) => {
    const da = (a._type === 'task' ? a.ActivityDate : a.StartDateTime?.slice(0, 10)) || '';
    const db = (b._type === 'task' ? b.ActivityDate : b.StartDateTime?.slice(0, 10)) || '';
    return db.localeCompare(da);
  });

  const openOpps = (opps || []).filter(o => !o.IsClosed);
  const wonOpps = (opps || []).filter(o => o.IsWon);
  const openARR = openOpps.reduce((s, o) => s + (o.Annual_Recurring_Revenue_ARR__c || 0), 0);
  const wonARR = wonOpps.reduce((s, o) => s + (o.Annual_Recurring_Revenue_ARR__c || 0), 0);

  // Derive last activity from fetched activities (more reliable than SF's LastActivityDate rollup)
  const lastActivityDate = allActivities.length > 0
    ? (allActivities[0]._type === 'task'
        ? allActivities[0].ActivityDate
        : allActivities[0].StartDateTime?.slice(0, 10))
    : null;

  const clientStatus = isClientTier(account?.AccountType_Tier__c) ? 'Client' : 'Prospect';

  return (
    // -m-6 bleeds outside PageShell's p-6 so the navy header extends edge-to-edge
    <div className="-m-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-rs-navy text-white px-6 py-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-white/50 hover:text-white text-xs mb-3 transition-colors"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Back to Accounts
        </button>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        ) : (
          <>
            <div className="flex items-start gap-2.5 flex-wrap">
              <h1 className="text-xl font-semibold">{account?.Name || '—'}</h1>
              {account?.AccountType_Tier__c && (
                <span className="mt-0.5 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-white/10 text-white/90">
                  {account.AccountType_Tier__c}
                </span>
              )}
              <span className={`mt-0.5 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold
                ${clientStatus === 'Client' ? 'bg-green-500/20 text-green-200' : 'bg-amber-500/20 text-amber-200'}`}>
                {clientStatus}
              </span>
              {account?.Current_ARR__c > 0 && (
                <span className="mt-0.5 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rs-teal/20 text-rs-teal">
                  ARR {formatARR(account.Current_ARR__c)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 mt-2 text-white/50 text-xs flex-wrap">
              {account?.Industry && <span>{account.Industry}</span>}
              {(account?.BillingCity || account?.BillingState) && (
                <span className="flex items-center gap-1">
                  <MapPinIcon className="h-3 w-3" />
                  {[account.BillingCity, account.BillingState].filter(Boolean).join(', ')}
                </span>
              )}
              {account?.Website && (
                <a
                  href={account.Website.startsWith('http') ? account.Website : `https://${account.Website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-white transition-colors"
                >
                  <GlobeAltIcon className="h-3 w-3" />
                  {account.Website.replace(/^https?:\/\//, '')}
                </a>
              )}
              {account?.Sales_Lead__r?.Name && (
                <span>Sales Lead: {account.Sales_Lead__r.Name}</span>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Sections ───────────────────────────────────────────────────────── */}
      <div className="p-6 space-y-8">

        {/* Relationship & Delivery */}
        <section>
          <SectionLabel>Relationship &amp; Delivery</SectionLabel>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Current ARR', value: loading ? null : formatARR(account?.Current_ARR__c) },
              { label: 'Open Deals', value: loading ? null : (opps ? openOpps.length : '—') },
              { label: 'Last Activity', value: (loading || activities === null) ? null : (lastActivityDate ? relativeDate(lastActivityDate) : '—') },
            ].map(({ label, value }) => (
              <div key={label} className="bg-rs-surface rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-widest text-rs-muted">{label}</p>
                {value === null
                  ? <Skeleton className="h-6 w-16 mt-1" />
                  : <p className="text-lg font-semibold text-rs-text mt-0.5">{value}</p>
                }
              </div>
            ))}
          </div>

          {/* Active deals table */}
          {!loading && openOpps.length > 0 && (
            <div className="border border-rs-border rounded-lg overflow-hidden mb-3">
              <div className="bg-rs-surface px-3 py-2 border-b border-rs-border flex items-center justify-between">
                <p className="text-xs font-semibold text-rs-text">Active Deals</p>
                <p className="text-xs text-rs-muted">{formatARR(openARR)} pipeline</p>
              </div>
              {openOpps.map(opp => (
                <button
                  key={opp.Id}
                  onClick={() => setActiveDeal(opp)}
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-rs-surface/60 border-b border-rs-border/50 last:border-0 text-left transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <StageBadge stage={opp.StageName} />
                    <span className="text-xs text-rs-text truncate">{opp.Name}</span>
                  </div>
                  <div className="text-xs text-rs-muted shrink-0 ml-2 text-right">
                    <span>{formatARR(opp.Annual_Recurring_Revenue_ARR__c)}</span>
                    {opp.CloseDate && <span className="ml-2">{opp.CloseDate}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Historical */}
          {!loading && wonOpps.length > 0 && (
            <p className="text-xs text-rs-muted">
              {wonOpps.length} closed-won deal{wonOpps.length !== 1 ? 's' : ''}, {formatARR(wonARR)} total ARR won
              {/* TODO: Extend with SKU/module data once Salesforce/Maxio product-per-SKU alignment lands */}
            </p>
          )}
        </section>

        {/* Account Plan */}
        <section>
          <SectionLabel>Account Plan</SectionLabel>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : (!account?.Sales_Next_Steps__c && !account?.Existing_Connections__c) ? (
            <div className="bg-rs-surface rounded-lg p-4 text-xs text-rs-muted">
              No account plan recorded in Salesforce.{' '}
              <span className="text-rs-text font-medium">
                Expected fields: Sales_Next_Steps__c, Existing_Connections__c
              </span>
            </div>
          ) : (
            <div className="space-y-4">
              {account?.Sales_Next_Steps__c && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-rs-muted mb-1">Next Steps</p>
                  <p className="text-sm text-rs-text whitespace-pre-wrap leading-relaxed">
                    {account.Sales_Next_Steps__c}
                  </p>
                </div>
              )}
              {account?.Existing_Connections__c && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-rs-muted mb-1">Existing Connections</p>
                  <p className="text-sm text-rs-text whitespace-pre-wrap leading-relaxed">
                    {account.Existing_Connections__c}
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Key Contacts */}
        <section>
          <SectionLabel>Key Contacts</SectionLabel>
          {loading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (contacts || []).length === 0 ? (
            <p className="text-xs text-rs-muted">No contacts found in Salesforce for this account.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {contacts.map(c => {
                const name = [c.FirstName, c.LastName].filter(Boolean).join(' ') || '—';
                const initials = [c.FirstName?.[0], c.LastName?.[0]].filter(Boolean).join('').toUpperCase();
                return (
                  <div key={c.Id} className="flex items-center gap-3 p-2.5 rounded-lg bg-rs-surface/50 border border-rs-border/30">
                    <div className="w-8 h-8 rounded-full bg-rs-navy flex items-center justify-center text-white text-xs font-semibold shrink-0">
                      {initials || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-rs-text">{name}</p>
                      {c.Title && <p className="text-[10px] text-rs-muted truncate">{c.Title}</p>}
                      {c.Email && (
                        <a href={`mailto:${c.Email}`} className="text-[10px] text-rs-teal hover:underline block truncate">
                          {c.Email}
                        </a>
                      )}
                      {c.Phone && (
                        <a href={`tel:${c.Phone}`} className="text-[10px] text-rs-muted hover:text-rs-teal hover:underline block truncate transition-colors">
                          {c.Phone}
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {/* TODO: wire async web-lookup enrichment for CEO/CRO auto-enrichment */}
          <div className="mt-3 p-3 rounded-lg bg-rs-surface border border-dashed border-rs-border text-xs text-rs-muted">
            CEO / CRO auto-enrichment coming soon — will auto-update from public sources
          </div>
        </section>

        {/* Activity & Engagement */}
        <section>
          <SectionLabel>Activity &amp; Engagement</SectionLabel>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-3 w-full" />)}
            </div>
          ) : (
            <>
              <div className="space-y-1.5 mb-4">
                <CadenceBar label="7 days" count={cadence.last7} total={Math.max(cadence.last365, 1)} />
                <CadenceBar label="90 days" count={cadence.last90} total={Math.max(cadence.last365, 1)} />
                <CadenceBar label="1 year" count={cadence.last365} total={Math.max(cadence.last365, 1)} />
              </div>
              {allActivities.length === 0 ? (
                <p className="text-xs text-rs-muted">No activity recorded this year.</p>
              ) : (
                <div>
                  {groupActivities(allActivities).map((entry, i) =>
                    entry.type === 'thread' ? (
                      <ActivityThread key={i} emails={entry.item} />
                    ) : (
                      <RichActivityItem key={entry.item?.Id || i} activity={entry.item} />
                    )
                  )}
                </div>
              )}
            </>
          )}
        </section>

        {/* Usage Placeholder */}
        <section>
          <SectionLabel>Product Usage</SectionLabel>
          {/* TODO: wire Snowflake usage data */}
          <div className="bg-rs-surface border border-dashed border-rs-border rounded-lg p-6 text-center">
            <p className="text-xs text-rs-muted">Product usage data — coming soon (Snowflake integration)</p>
          </div>
        </section>
      </div>

      {/* Deal detail panel */}
      {activeDeal && (
        <DealDetailPanel deal={activeDeal} onClose={() => setActiveDeal(null)} />
      )}
    </div>
  );
}
