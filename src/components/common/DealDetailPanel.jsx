import { useState, useEffect } from 'react';
import { differenceInDays, format } from 'date-fns';
import SlidePanel from './SlidePanel';
import { fetchAccountDetail, fetchAccountActivities } from '../../datasources/salesforce';
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
        <div key={i} className="h-5 rounded bg-rs-border animate-pulse" style={{ width: `${70 + (i % 3) * 10}%` }} />
      ))}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm py-1">
      <span className="text-rs-muted shrink-0 w-32 text-xs">{label}</span>
      <span className="text-right text-xs">{children}</span>
    </div>
  );
}

function ActivityItem({ activity }) {
  const date = activity.ActivityDate || activity.StartDateTime;
  const type = activity.Type || (activity._src === 'event' ? 'Event' : 'Task');
  return (
    <div className="flex gap-3 py-2.5 border-b border-rs-border/50 last:border-0">
      <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded bg-rs-surface text-rs-muted uppercase tracking-wide mt-0.5">
        {type}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-rs-text leading-snug">{activity.Subject || '—'}</p>
        <p className="text-[10px] text-rs-muted mt-0.5">
          {date ? format(new Date(date), 'MMM d, yyyy') : '—'}
          {activity.Owner?.Name ? ` · ${activity.Owner.Name}` : ''}
        </p>
      </div>
    </div>
  );
}

export default function DealDetailPanel({ deal, onClose, tasks, events }) {
  const [account, setAccount] = useState(null);
  const [activities, setActivities] = useState(null);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [loadingActivities, setLoadingActivities] = useState(false);

  useEffect(() => {
    if (!deal) return;
    setAccount(null);
    setActivities(null);

    if (deal.AccountId) {
      setLoadingAccount(true);
      fetchAccountDetail(deal.AccountId)
        .then(setAccount)
        .catch(() => setAccount({}))
        .finally(() => setLoadingAccount(false));
    }

    // Use passed tasks/events if available (Rep KPIs page), otherwise fetch on demand
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
      setActivities(merged.slice(0, 20));
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
          setActivities(merged.slice(0, 20));
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

  return (
    <SlidePanel
      open={!!deal}
      onClose={onClose}
      title={deal?.Account?.Name || deal?.Name || '—'}
      subtitle={deal?.Owner?.Name}
    >
      {deal && (
        <div className="p-5 space-y-6">
          {/* Deal Info */}
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-rs-muted mb-3">Deal Info</h3>
            <div className="divide-y divide-rs-border/50">
              <Row label="Stage">
                <span className="px-2 py-0.5 rounded-full bg-rs-teal/10 text-rs-teal font-medium text-[11px]">
                  {deal.StageName}
                </span>
              </Row>
              <Row label="ARR">
                <span className="font-semibold text-rs-text">{formatARR(arr)}</span>
              </Row>
              {deal.CloseDate && (
                <Row label="Close Date">
                  <span className={new Date(deal.CloseDate) < new Date() ? 'text-rs-overdueText font-medium' : 'text-rs-text'}>
                    {format(new Date(deal.CloseDate), 'MMM d, yyyy')}
                  </span>
                </Row>
              )}
              <Row label="Days in Stage">
                <span className={isOverdue ? 'text-rs-overdueText font-semibold' : 'text-rs-text'}>
                  {daysInStage}d
                  {isOverdue && (
                    <span className="ml-1.5 text-[10px] bg-[rgba(232,138,26,0.15)] text-rs-overdueText px-1.5 py-0.5 rounded-full">
                      +{daysOver}d over
                    </span>
                  )}
                </span>
              </Row>
              {deal.ForecastCategoryName && (
                <Row label="Forecast"><span className="text-rs-text">{deal.ForecastCategoryName}</span></Row>
              )}
            </div>
          </section>

          {/* Company Info */}
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-rs-muted mb-3">Company Info</h3>
            {loadingAccount ? (
              <Skeleton rows={4} />
            ) : account ? (
              <div className="divide-y divide-rs-border/50">
                {account.Industry && <Row label="Industry"><span className="text-rs-text">{account.Industry}</span></Row>}
                {account.Type && <Row label="Type"><span className="text-rs-text">{account.Type}</span></Row>}
                {account.Website && (
                  <Row label="Website">
                    <a href={account.Website} target="_blank" rel="noopener noreferrer" className="text-rs-teal hover:underline max-w-[180px] truncate block">
                      {account.Website.replace(/^https?:\/\//, '')}
                    </a>
                  </Row>
                )}
                {account.Phone && <Row label="Phone"><span className="text-rs-text">{account.Phone}</span></Row>}
                {account.AnnualRevenue > 0 && (
                  <Row label="Annual Revenue"><span className="text-rs-text">{formatARR(account.AnnualRevenue)}</span></Row>
                )}
                {account.Description && (
                  <div className="pt-2 text-xs text-rs-muted leading-relaxed line-clamp-4">{account.Description}</div>
                )}
              </div>
            ) : (
              <p className="text-xs text-rs-muted">No account data</p>
            )}
          </section>

          {/* Activity Feed */}
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-rs-muted mb-3">Recent Activity</h3>
            {loadingActivities ? (
              <Skeleton rows={3} />
            ) : activities?.length ? (
              <div>
                {activities.map((a, i) => (
                  <ActivityItem key={a.Id || i} activity={a} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-rs-muted">No recent activity found</p>
            )}
          </section>
        </div>
      )}
    </SlidePanel>
  );
}
