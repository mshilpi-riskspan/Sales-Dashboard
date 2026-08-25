import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import SlidePanel from '../../components/common/SlidePanel';

// "Client Prospecting" deals are pre-qualification — no real ARR commitment
// yet — so they're broken out into their own section below the active deals
// rather than mixed in, matching the raw StageName Salesforce actually uses
// (see the same literal hardcoded in src/datasources/salesforce.js's SOQL).
const PROSPECTING_STAGE = 'Client Prospecting';

function formatARR(v) {
  if (!v && v !== 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

function sortDeals(deals, sortBy) {
  return [...deals].sort((a, b) => {
    if (sortBy === 'arr') {
      return (b.Annual_Recurring_Revenue_ARR__c ?? b.Amount ?? 0) - (a.Annual_Recurring_Revenue_ARR__c ?? a.Amount ?? 0);
    }
    return new Date((a.CloseDate || 0) + 'T00:00:00') - new Date((b.CloseDate || 0) + 'T00:00:00');
  });
}

function DealTable({ deals, onDealClick }) {
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
        {deals.map((deal) => {
          const arr = deal.Annual_Recurring_Revenue_ARR__c ?? deal.Amount;
          const isPast = deal.CloseDate && new Date(deal.CloseDate + 'T00:00:00') < new Date();
          return (
            <tr
              key={deal.Id}
              onClick={() => onDealClick(deal)}
              className="border-b border-rs-border hover:bg-rs-surface cursor-pointer transition-colors"
            >
              <td className="py-2 pr-3 text-xs font-medium text-rs-text">
                {deal.Account?.Name || deal.Name || '—'}
              </td>
              <td className="py-2 pr-3 text-xs text-rs-muted">{deal.StageName}</td>
              <td className="py-2 pr-3 text-xs text-right font-semibold text-rs-text">{formatARR(arr)}</td>
              <td className={`py-2 text-xs text-right ${isPast ? 'text-rs-overdueText font-medium' : 'text-rs-muted'}`}>
                {deal.CloseDate ? format(new Date(deal.CloseDate + 'T00:00:00'), 'MMM d') : '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function PipelineListPanel({ deals, onClose, onDealClick, title = 'Total Pipeline' }) {
  const [sortBy, setSortBy] = useState('arr');

  const { activeDeals, prospectingDeals } = useMemo(() => {
    if (!deals) return { activeDeals: [], prospectingDeals: [] };
    const active = deals.filter((d) => d.StageName !== PROSPECTING_STAGE);
    const prospecting = deals.filter((d) => d.StageName === PROSPECTING_STAGE);
    return { activeDeals: sortDeals(active, sortBy), prospectingDeals: sortDeals(prospecting, sortBy) };
  }, [deals, sortBy]);

  const totalArr = deals?.reduce((s, d) => s + (d.Annual_Recurring_Revenue_ARR__c ?? d.Amount ?? 0), 0) || 0;

  return (
    <SlidePanel
      open={!!deals}
      onClose={onClose}
      title={title}
      subtitle={`${activeDeals.length} deal${activeDeals.length !== 1 ? 's' : ''} · ${formatARR(totalArr)} ARR`}
      width={560}
    >
      <div className="p-4">
        <div className="flex gap-2 mb-4">
          {[['arr', 'By ARR'], ['close', 'By Close Date']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                sortBy === key
                  ? 'bg-rs-teal text-white border-rs-teal'
                  : 'text-rs-muted border-rs-border hover:border-rs-teal/50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeDeals.length > 0 && (
          <div>
            {prospectingDeals.length > 0 && (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-rs-text">Active</span>
                <span className="text-[10px] font-medium text-rs-muted bg-rs-surface rounded-full px-1.5 py-0.5">{activeDeals.length}</span>
              </div>
            )}
            <DealTable deals={activeDeals} onDealClick={onDealClick} />
          </div>
        )}

        {prospectingDeals.length > 0 && (
          <div className={`rounded-lg border border-amber-200 bg-amber-50/60 p-3 ${activeDeals.length > 0 ? 'mt-6' : ''}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Prospecting — not yet qualified</span>
              <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 rounded-full px-1.5 py-0.5">{prospectingDeals.length}</span>
            </div>
            <DealTable deals={prospectingDeals} onDealClick={onDealClick} />
          </div>
        )}
      </div>
    </SlidePanel>
  );
}
