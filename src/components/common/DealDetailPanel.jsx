import { useState, useEffect } from 'react';
import { differenceInDays, format, startOfYear, startOfQuarter, startOfMonth, startOfWeek } from 'date-fns';
import SlidePanel from './SlidePanel';
import { fetchAccountDetail, fetchAccountActivities, fetchAccountContacts } from '../../datasources/salesforce';
import { STAGE_MAP } from '../../config/salesStages';

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

function ActivityItem({ activity }) {
  const [expanded, setExpanded] = useState(false);
  const date = activity.ActivityDate || activity.StartDateTime;
  const type = activity.Type || (activity._src === 'event' ? 'Event' : 'Task');
  const body = activity.Description;
  const preview = body ? body.replace(/\r\n/g, ' ').replace(/\n/g, ' ').trim() : null;
  const isLong = preview && preview.length > 120;

  return (
    <div className="py-2.5 border-b border-rs-border/50 last:border-0">
      <div className="flex gap-3">
        <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded bg-rs-surface text-rs-muted uppercase tracking-wide mt-0.5">
          {type}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-rs-text leading-snug">{activity.Subject || '—'}</p>
          <p className="text-[10px] text-rs-muted mt-0.5">
            {date ? format(new Date(date), 'MMM d, yyyy') : '—'}
            {activity.Owner?.Name ? ` · ${activity.Owner.Name}` : ''}
          </p>
          {preview && (
            <div className="mt-1.5">
              <p className="text-[11px] text-rs-muted leading-relaxed">
                {expanded || !isLong ? preview : `${preview.slice(0, 120)}…`}
              </p>
              {isLong && (
                <button
                  onClick={() => setExpanded((e) => !e)}
                  className="text-[10px] text-rs-teal hover:underline mt-0.5"
                >
                  {expanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ContactItem({ contact }) {
  const name = [contact.FirstName, contact.LastName].filter(Boolean).join(' ');
  return (
    <div className="flex items-start gap-3 py-2 border-b border-rs-border/50 last:border-0">
      <div className="shrink-0 w-7 h-7 rounded-full bg-rs-teal/15 text-rs-teal flex items-center justify-center text-[11px] font-semibold">
        {(contact.FirstName?.[0] || '?')}{(contact.LastName?.[0] || '')}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-rs-text leading-tight">{name}</p>
        {contact.Title && <p className="text-[10px] text-rs-muted mt-0.5 leading-snug">{contact.Title}</p>}
        {contact.Email && (
          <a href={`mailto:${contact.Email}`} className="text-[10px] text-rs-teal hover:underline mt-0.5 block truncate">
            {contact.Email}
          </a>
        )}
      </div>
      {contact.Phone && (
        <a href={`tel:${contact.Phone}`} className="text-[10px] text-rs-muted hover:text-rs-teal shrink-0 mt-0.5">
          {contact.Phone}
        </a>
      )}
    </div>
  );
}

function computeCadence(activities) {
  const now = new Date();
  const yearStart = startOfYear(now);
  const quarterStart = startOfQuarter(now);
  const monthStart = startOfMonth(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });

  const getDate = (a) => new Date(a.ActivityDate || a.StartDateTime || a.CreatedDate || 0);

  const ytd = activities.filter((a) => getDate(a) >= yearStart).length;
  const qtd = activities.filter((a) => getDate(a) >= quarterStart).length;
  const mtd = activities.filter((a) => getDate(a) >= monthStart).length;
  const wk = activities.filter((a) => getDate(a) >= weekStart).length;

  return { ytd, qtd, mtd, wk };
}

export default function DealDetailPanel({ deal, onClose, tasks, events }) {
  const [account, setAccount] = useState(null);
  const [activities, setActivities] = useState(null);
  const [contacts, setContacts] = useState(null);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [showAllContacts, setShowAllContacts] = useState(false);

  useEffect(() => {
    if (!deal) return;
    setAccount(null);
    setActivities(null);
    setContacts(null);
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
  const cadenceMax = cadence?.ytd || 1;

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
              <Row label="Stage">
                <span className="px-2 py-0.5 rounded-full bg-rs-teal/10 text-rs-teal font-medium text-[11px]">
                  {deal.StageName}
                </span>
              </Row>
              <Row label="ARR">
                <span className="font-semibold">{formatARR(arr)}</span>
              </Row>
              {deal.CloseDate && (
                <Row label="Close Date">
                  <span className={new Date(deal.CloseDate) < new Date() && !deal.IsClosed ? 'text-rs-overdueText font-medium' : ''}>
                    {format(new Date(deal.CloseDate), 'MMM d, yyyy')}
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
            </div>
          </section>

          {/* Next Steps */}
          {deal.NextStep && (
            <section>
              <SectionLabel>Next Steps</SectionLabel>
              <p className="text-xs text-rs-text leading-relaxed bg-rs-teal/5 border border-rs-teal/20 rounded-lg px-3 py-2.5">
                {deal.NextStep}
              </p>
            </section>
          )}

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
              <SectionLabel>Activity Cadence (YTD)</SectionLabel>
              <div className="space-y-2.5">
                <CadenceBar label="This Year" count={cadence.ytd} max={cadenceMax} />
                <CadenceBar label="This Qtr" count={cadence.qtd} max={cadenceMax} />
                <CadenceBar label="This Mo" count={cadence.mtd} max={cadenceMax} />
                <CadenceBar label="This Week" count={cadence.wk} max={cadenceMax} />
              </div>
            </section>
          )}

          {/* Activity Feed */}
          <section>
            <SectionLabel>Activity Feed</SectionLabel>
            {loadingActivities ? (
              <Skeleton rows={3} />
            ) : activities?.length ? (
              <div>
                {activities.map((a, i) => (
                  <ActivityItem key={a.Id || i} activity={a} />
                ))}
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
