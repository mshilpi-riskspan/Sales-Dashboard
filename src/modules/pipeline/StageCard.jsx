import { useState } from 'react';
import { differenceInDays } from 'date-fns';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import StageInfoTooltip from '../../components/common/StageInfoTooltip';
import DealRow from './DealRow';
import EmptyState from '../../components/common/EmptyState';

function formatARR(v) {
  if (!v) return '$0';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

export default function StageCard({ stage, deals, onDealClick }) {
  const [expanded, setExpanded] = useState(true);

  const totalArr = deals.reduce((sum, d) => {
    return sum + (d.Annual_Recurring_Revenue_ARR__c ?? d.Amount ?? 0);
  }, 0);

  const overdueCount = deals.filter((d) => {
    const dateStr = d.LastStageChangeDate || d.CreatedDate;
    const days = dateStr ? differenceInDays(new Date(), new Date(dateStr)) : 0;
    return stage.dayLimit && days > stage.dayLimit;
  }).length;

  const onTrackPct = deals.length > 0 ? Math.round(((deals.length - overdueCount) / deals.length) * 100) : 100;
  const healthColor = onTrackPct >= 80 ? 'text-green-600' : onTrackPct >= 50 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="rounded-card border border-rs-border bg-white overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-rs-border bg-rs-surface">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-rs-teal bg-rs-teal/10 rounded-full w-6 h-6 flex items-center justify-center">
            {stage.order}
          </span>
          <h3 className="text-sm font-semibold text-rs-text">{stage.name}</h3>
          {stage.dayLimit && (
            <span className="text-[11px] text-rs-muted font-medium bg-rs-border/60 rounded px-1.5 py-0.5">
              {stage.dayLimit}d goal
            </span>
          )}
          <StageInfoTooltip stage={stage} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-rs-muted">{deals.length} deal{deals.length !== 1 ? 's' : ''}</span>
          <span className="text-xs font-semibold text-rs-text">{formatARR(totalArr)}</span>
          {deals.length > 0 && (
            <span className={`text-xs font-medium ${healthColor}`}>{onTrackPct}% on track</span>
          )}
          {overdueCount > 0 && (
            <span className="text-xs bg-amber-100 text-rs-overdueText border border-amber-300 rounded-full px-2 py-0.5 font-semibold">
              {overdueCount} overdue
            </span>
          )}
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-rs-muted hover:text-rs-text transition-colors"
          >
            {expanded ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Deals table */}
      {expanded && (
        <div>
          {deals.length === 0 ? (
            <EmptyState message="No open deals in this stage" />
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  {['Account', 'AE Owner', 'ARR', 'Days in Stage'].map((h) => (
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
                {[...deals].sort((a, b) =>
                  (b.Annual_Recurring_Revenue_ARR__c ?? b.Amount ?? 0) -
                  (a.Annual_Recurring_Revenue_ARR__c ?? a.Amount ?? 0)
                ).map((deal) => (
                  <DealRow key={deal.Id} deal={deal} stageConfig={stage} onClick={onDealClick} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
