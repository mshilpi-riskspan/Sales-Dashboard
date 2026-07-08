import { useState, useEffect, useMemo } from 'react';
import { differenceInDays, format, subDays } from 'date-fns';
import SlidePanel from './SlidePanel';
import { fetchAccountDetail, fetchAccountActivities, fetchAccountContacts, fetchOpportunityHistory } from '../../datasources/salesforce';
import { STAGE_MAP } from '../../config/salesStages';

// Parses a raw Salesforce email Task Description into structured parts.
// SF stores emails as: "To: ... CC: ... Subject: ... Body: [message] From: [reply chain]"
function parseActivityBody(description, type) {
  if (!description) return { body: null, meta: null };
  const raw = description.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  const isEmail = type === 'Email' || /^To:\s|Body:\s/.test(raw);

  if (isEmail) {
    // Extract To/CC/Subject from header block
    const toMatch = raw.match(/^To:\s*([^\n]+?)(?:\s+CC:|$)/m);
    const subjectMatch = raw.match(/Subject:\s*([^\n]+?)(?:\s+Body:|$)/m);
    const bodyMatch = raw.match(/Body:\s*([\s\S]*?)(?:\n(?:From:|Sent:|[-_]{10,})|\s*$)/);

    let body = bodyMatch ? bodyMatch[1].trim() : null;
    // Strip "External Email: Be cautious..." security banner (ends at first real sentence)
    if (body) {
      body = body.replace(/^External Email:.*?(?=\n\n|\n[A-Z]|[A-Z][a-z]{2,}\s+\/)/s, '').trim();
      // Strip trailing Teams meeting boilerplate
      body = body.replace(/\n[-_]{3,}[\s\S]*/m, '').trim();
    }

    const to = toMatch ? toMatch[1].replace(/;/g, ' ·').trim() : null;
    const subject = subjectMatch ? subjectMatch[1].trim() : null;

    return { body: body || null, meta: { to, subject }, isEmail: true };
  }

  // Non-email (meeting notes, calls): show as-is but strip reply chains
  const replyIdx = raw.search(/\n[-_]{10,}|\nFrom:\s[A-Z]/);
  const body = replyIdx > 0 ? raw.slice(0, replyIdx).trim() : raw;
  return { body, meta: null, isEmail: false };
}

function formatARR(v) {
  if (!v && v !== 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

function Skeleton({ rows = 3 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-4 rounded bg-rs-border animate-pulse" style={{ width: `${60 + (i % 3) * 15}%` }} />
      ))}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <h3 className="text-[10px] font-bold uppercase tracking-widest text-rs-muted mb-3">{children}</h3>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <span className="text-rs-muted shrink-0 w-28 text-xs">{label}</span>
      <span className="text-right text-xs text-rs-text">{children}</span>
    </div>
  );
}

function CadenceBar({ label, count, max }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] text-rs-muted w-16 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-rs-border overflow-hidden">
        <div
          className="h-full rounded-full bg-rs-teal transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-rs-text w-5 text-right">{count}</span>
    </div>
  );
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
    <span className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded ${meta.color} uppercase tracking-wide leading-none`}>
      {meta.label}
    </span>
  );
}

function ActivityItem({ activity, compact = false, prevOwner = null }) {
  const [expanded, setExpanded] = useState(false);
  const date = activity.ActivityDate || activity.StartDateTime;
  const type = activity.Type || (activity._src === 'event' ? 'Event' : 'Task');
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
          <p className="text-[10px] text-rs-muted mb-1 truncate">
            <span className="font-medium">To:</span> {meta.to}
          </p>
        )}
        {body && (
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
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-[10px] text-rs-teal hover:underline mt-1"
            >
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
            <ActivityItem key={e.Id || i} activity={e} compact prevOwner={i > 0 ? emails[i - 1].Owner?.Name : null} />
          ))}
        </div>
      )}
    </div>
  );
}

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

function ContactItem({ contact }) {
  const name = [contact.FirstName, contact.LastName].filter(Boolean).join(' ');
  const lastActive = relativeDate(contact.LastActivityDate);
  return (
    <div className="flex items-start gap-3 py-2 border-b border-rs-border/50 last:border-0">
      <div className="shrink-0 w-7 h-7 rounded-full bg-rs-teal/15 text-rs-teal flex items-center justify-center text-[11px] font-semibold">
        {(contact.FirstName?.[0] || '?')}{(contact.LastName?.[0] || '')}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-rs-text leading-tight">{name}</p>
          {lastActive && (
            <span className="text-[10px] text-rs-muted shrink-0">{lastActive}</span>
          )}
        </div>
        {contact.Title && <p className="text-[10px] text-rs-muted mt-0.5 leading-snug">{contact.Title}</p>}
        {contact.Email && (
          <a href={`mailto:${contact.Email}`} className="text-[10px] text-rs-teal hover:underline mt-0.5 block truncate">
            {contact.Email}
          </a>
        )}
      </div>
    </div>
  );
}

function computeCadence(activities) {
  const now = new Date();
  const getDate = (a) => new Date(a.ActivityDate || a.StartDateTime || a.CreatedDate || 0);

  const l7   = activities.filter((a) => getDate(a) >= subDays(now, 7)).length;
  const l90  = activities.filter((a) => getDate(a) >= subDays(now, 90)).length;
  const l365 = activities.filter((a) => getDate(a) >= subDays(now, 365)).length;

  return { l7, l90, l365 };
}

function computeStageTimeline(historyRecords) {
  if (!historyRecords?.length) return [];
  const now = new Date();
  return historyRecords.map((record, i) => {
    const entryDate = new Date(record.CreatedDate);
    const nextDate = historyRecords[i + 1] ? new Date(historyRecords[i + 1].CreatedDate) : now;
    const days = differenceInDays(nextDate, entryDate);
    const isCurrent = i === historyRecords.length - 1;
    const stageConfig = STAGE_MAP[record.StageName];
    const isOverdue = stageConfig?.dayLimit && days > stageConfig.dayLimit;
    const daysOver = isOverdue ? days - stageConfig.dayLimit : 0;
    return { stageName: record.StageName, entryDate, exitDate: isCurrent ? null : nextDate, days, isCurrent, isOverdue, daysOver, dayLimit: stageConfig?.dayLimit ?? null };
  });
}

function StageTimeline({ historyRecords }) {
  const stages = computeStageTimeline(historyRecords);
  if (!stages.length) return <p className="text-xs text-rs-muted">No stage history found</p>;

  return (
    <div className="relative">
      {/* Vertical connector line */}
      <div className="absolute left-[7px] top-3 bottom-3 w-px bg-rs-border" />
      <div className="space-y-0">
        {stages.map((s, i) => (
          <div key={i} className="flex items-start gap-3 py-2">
            {/* Dot */}
            <div className={`relative z-10 mt-1 shrink-0 w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center
              ${s.isCurrent
                ? 'bg-rs-teal border-rs-teal'
                : s.isOverdue
                  ? 'bg-[#FFA91D] border-[#FFA91D]'
                  : 'bg-white border-rs-teal'
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-medium leading-tight ${s.isCurrent ? 'text-rs-teal' : 'text-rs-text'}`}>
                  {s.stageName}
                </span>
                {s.isCurrent && (
                  <span className="text-[10px] bg-rs-teal/10 text-rs-teal px-1.5 py-0.5 rounded-full font-medium leading-none">
                    current
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-rs-muted">
                  {format(s.entryDate, 'MMM d')}
                  {s.exitDate ? ` – ${format(s.exitDate, 'MMM d')}` : ' – now'}
                </span>
                <span className={`text-[10px] font-semibold ${s.isOverdue ? 'text-rs-overdueText' : 'text-rs-muted'}`}>
                  {s.days}d
                </span>
                {s.isOverdue && (
                  <span className="text-[10px] bg-[rgba(232,138,26,0.15)] text-rs-overdueText px-1.5 py-0.5 rounded-full font-medium leading-none">
                    +{s.daysOver}d over
                  </span>
                )}
                {!s.isOverdue && s.dayLimit && (
                  <span className="text-[10px] text-green-600">✓</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DealDetailPanel({ deal, onClose, tasks, events }) {
  const [account, setAccount] = useState(null);
  const [activities, setActivities] = useState(null);
  const [contacts, setContacts] = useState(null);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [stageHistory, setStageHistory] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showAllContacts, setShowAllContacts] = useState(false);

  useEffect(() => {
    if (!deal) return;
    setAccount(null);
    setActivities(null);
    setContacts(null);
    setStageHistory(null);
    setShowAllContacts(false);

    if (deal.AccountId) {
      setLoadingAccount(true);
      fetchAccountDetail(deal.AccountId)
        .then(setAccount)
        .catch(() => setAccount({}))
        .finally(() => setLoadingAccount(false));

      setLoadingContacts(true);
      fetchAccountContacts(deal.AccountId)
        .then(setContacts)
        .catch(() => setContacts([]))
        .finally(() => setLoadingContacts(false));
    }

    setLoadingHistory(true);
    fetchOpportunityHistory(deal.Id)
      .then(setStageHistory)
      .catch(() => setStageHistory([]))
      .finally(() => setLoadingHistory(false));

    if (tasks && events) {
      const merged = [
        ...tasks
          .filter((t) => t.WhatId === deal.AccountId || t.WhatId === deal.Id)
          .map((t) => ({ ...t, _src: 'task' })),
        ...events
          .filter((e) => e.WhatId === deal.AccountId || e.WhatId === deal.Id)
          .map((e) => ({ ...e, _src: 'event' })),
      ].sort((a, b) => {
        const da = new Date(a.ActivityDate || a.StartDateTime || a.CreatedDate || 0);
        const db = new Date(b.ActivityDate || b.StartDateTime || b.CreatedDate || 0);
        return db - da;
      });
      setActivities(merged.slice(0, 50));
    } else if (deal.AccountId) {
      setLoadingActivities(true);
      fetchAccountActivities(deal.AccountId)
        .then(({ tasks: t, events: e }) => {
          const merged = [
            ...t.map((x) => ({ ...x, _src: 'task' })),
            ...e.map((x) => ({ ...x, _src: 'event' })),
          ].sort((a, b) => {
            const da = new Date(a.ActivityDate || a.StartDateTime || 0);
            const db = new Date(b.ActivityDate || b.StartDateTime || 0);
            return db - da;
          });
          setActivities(merged);
        })
        .catch(() => setActivities([]))
        .finally(() => setLoadingActivities(false));
    }
  }, [deal?.Id]);

  const stageConfig = deal ? STAGE_MAP[deal.StageName] : null;
  const dateStr = deal?.LastStageChangeDate || deal?.CreatedDate;
  const daysInStage = dateStr ? differenceInDays(new Date(), new Date(dateStr)) : 0;
  const isOverdue = stageConfig?.dayLimit && daysInStage > stageConfig.dayLimit;
  const daysOver = isOverdue ? daysInStage - stageConfig.dayLimit : 0;
  const arr = deal ? (deal.Annual_Recurring_Revenue_ARR__c ?? deal.Amount) : null;

  const cadence = activities ? computeCadence(activities) : null;
  const groupedActivities = useMemo(() => activities ? groupActivities(activities) : null, [activities]);
  const cadenceMax = cadence?.l365 || 1;

  const visibleContacts = contacts
    ? (showAllContacts ? contacts : contacts.slice(0, 5))
    : [];

  return (
    <SlidePanel
      open={!!deal}
      onClose={onClose}
      title={deal?.Account?.Name || deal?.Name || '—'}
      subtitle={deal?.Owner?.Name}
      width={540}
    >
      {deal && (
        <div className="p-5 space-y-6">

          {/* Deal Info */}
          <section>
            <SectionLabel>Deal</SectionLabel>
            <div className="divide-y divide-rs-border/50">
              <Row label="Opportunity">
                <span className="text-rs-text font-medium text-xs">{deal.Name}</span>
              </Row>
              <Row label="Stage">
                <span className="px-2 py-0.5 rounded-full bg-rs-teal/10 text-rs-teal font-medium text-[11px]">
                  {deal.StageName}
                </span>
              </Row>
              {deal.Type && (
                <Row label="Type">
                  <span className={`px-2 py-0.5 rounded-full font-medium text-[11px] ${
                    deal.Type === 'New Account'   ? 'bg-rs-teal/10 text-rs-teal' :
                    deal.Type === 'Upsell'        ? 'bg-amber-50 text-amber-700' :
                    deal.Type === 'Cross-Sell'    ? 'bg-green-50 text-green-700' :
                    deal.Type === 'Renewal'       ? 'bg-blue-50 text-blue-600' :
                    'bg-rs-surface text-rs-muted'
                  }`}>
                    {deal.Type}
                  </span>
                </Row>
              )}
              <Row label="ARR">
                <span className="font-semibold">{formatARR(arr)}</span>
              </Row>
              {deal.CloseDate && (
                <Row label="Close Date">
                  <span className={new Date(deal.CloseDate + 'T00:00:00') < new Date() && !deal.IsClosed ? 'text-rs-overdueText font-medium' : ''}>
                    {format(new Date(deal.CloseDate + 'T00:00:00'), 'MMM d, yyyy')}
                  </span>
                </Row>
              )}
              <Row label="Days in Stage">
                <span className={isOverdue ? 'text-rs-overdueText font-semibold' : ''}>
                  {daysInStage}d
                  {isOverdue && (
                    <span className="ml-1.5 text-[10px] bg-[rgba(232,138,26,0.15)] text-rs-overdueText px-1.5 py-0.5 rounded-full">
                      +{daysOver}d over
                    </span>
                  )}
                </span>
              </Row>
              {deal.ForecastCategoryName && (
                <Row label="Forecast">{deal.ForecastCategoryName}</Row>
              )}
              {deal.Loss_Reason__c && (
                <Row label="Loss Reason">
                  <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-medium text-[11px]">
                    {deal.Loss_Reason__c}
                  </span>
                </Row>
              )}
            </div>
          </section>

          {/* Loss explanation */}
          {deal.Closed_Lost_Reason_Explanation__c && (
            <section>
              <SectionLabel>Loss Explanation</SectionLabel>
              <p className="text-xs text-rs-text leading-relaxed bg-red-50/60 border border-red-100 rounded-lg px-3 py-2.5">
                {deal.Closed_Lost_Reason_Explanation__c}
              </p>
            </section>
          )}

          {/* Next Steps */}
          {deal.NextStep && (
            <section>
              <SectionLabel>Next Steps</SectionLabel>
              <p className="text-xs text-rs-text leading-relaxed bg-rs-teal/5 border border-rs-teal/20 rounded-lg px-3 py-2.5">
                {deal.NextStep}
              </p>
            </section>
          )}

          {/* Stage History */}
          <section>
            <SectionLabel>Stage History</SectionLabel>
            {loadingHistory ? (
              <Skeleton rows={3} />
            ) : (
              <StageTimeline historyRecords={stageHistory} />
            )}
          </section>

          {/* Company Info */}
          <section>
            <SectionLabel>Company</SectionLabel>
            {loadingAccount ? (
              <Skeleton rows={4} />
            ) : account ? (
              <div className="divide-y divide-rs-border/50">
                {account.Industry && <Row label="Industry">{account.Industry}</Row>}
                {account.Type && <Row label="Type">{account.Type}</Row>}
                {(account.BillingCity || account.BillingState) && (
                  <Row label="Location">
                    {[account.BillingCity, account.BillingState].filter(Boolean).join(', ')}
                  </Row>
                )}
                {account.Website && (
                  <Row label="Website">
                    <a href={account.Website} target="_blank" rel="noopener noreferrer" className="text-rs-teal hover:underline max-w-[180px] truncate block">
                      {account.Website.replace(/^https?:\/\//, '')}
                    </a>
                  </Row>
                )}
                {account.Phone && <Row label="Phone">{account.Phone}</Row>}
                {account.AnnualRevenue > 0 && (
                  <Row label="Revenue">{formatARR(account.AnnualRevenue)}</Row>
                )}
                {account.Owner?.Name && <Row label="Account Owner">{account.Owner.Name}</Row>}
                {account.Description && (
                  <div className="pt-2 text-xs text-rs-muted leading-relaxed line-clamp-4">{account.Description}</div>
                )}
              </div>
            ) : (
              <p className="text-xs text-rs-muted">No account data</p>
            )}
          </section>

          {/* Contacts */}
          <section>
            <SectionLabel>
              Contacts{contacts ? ` (${contacts.length})` : ''}
            </SectionLabel>
            {loadingContacts ? (
              <Skeleton rows={3} />
            ) : contacts?.length ? (
              <>
                <div>
                  {visibleContacts.map((c) => (
                    <ContactItem key={c.Id} contact={c} />
                  ))}
                </div>
                {contacts.length > 5 && (
                  <button
                    onClick={() => setShowAllContacts((s) => !s)}
                    className="mt-2 text-[11px] text-rs-teal hover:underline"
                  >
                    {showAllContacts ? 'Show fewer' : `Show all ${contacts.length} contacts`}
                  </button>
                )}
              </>
            ) : (
              <p className="text-xs text-rs-muted">No contacts found</p>
            )}
          </section>

          {/* Meeting Cadence */}
          {cadence && (
            <section>
              <SectionLabel>Activity Cadence</SectionLabel>
              <div className="space-y-2.5">
                <CadenceBar label="Last 365 days" count={cadence.l365} max={cadenceMax} />
                <CadenceBar label="Last 90 days"  count={cadence.l90}  max={cadenceMax} />
                <CadenceBar label="Last 7 days"   count={cadence.l7}   max={cadenceMax} />
              </div>
            </section>
          )}

          {/* Activity Feed */}
          <section>
            <SectionLabel>Activity Feed</SectionLabel>
            {loadingActivities ? (
              <Skeleton rows={3} />
            ) : groupedActivities?.length ? (
              <div>
                {groupedActivities.map((entry, i) =>
                  entry.type === 'thread' ? (
                    <ActivityThread key={i} emails={entry.item} />
                  ) : (
                    <ActivityItem key={entry.item.Id || i} activity={entry.item} />
                  )
                )}
              </div>
            ) : (
              <p className="text-xs text-rs-muted">No activity found this year</p>
            )}
          </section>

        </div>
      )}
    </SlidePanel>
  );
}
