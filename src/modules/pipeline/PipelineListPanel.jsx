import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import SlidePanel from '../../components/common/SlidePanel';

function formatARR(v) {
  if (!v && v !== 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

export default function PipelineListPanel({ deals, onClose, onDealClick }) {
  const [sortBy, setSortBy] = useState('arr');

  const sorted = useMemo(() => {
    if (!deals) return [];
    return [...deals].sort((a, b) => {
      if (sortBy === 'arr') {
        return (b.Annual_Recurring_Revenue_ARR__c ?? b.Amount ?? 0) - (a.Annual_Recurring_Revenue_ARR__c ?? a.Amount ?? 0);
      }
      return new Date(a.CloseDate || 0) - new Date(b.CloseDate || 0);
    });
  }, [deals, sortBy]);

  const totalArr = deals?.reduce((s, d) => s + (d.Annual_Recurring_Revenue_ARR__c ?? d.Amount ?? 0), 0) || 0;

  return (
    <SlidePanel
      open={!!deals}
      onClose={onClose}
      title="Total Pipeline"
      subtitle={`${deals?.length || 0} deals · ${formatARR(totalArr)} ARR`}
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
              const isPast = deal.CloseDate && new Date(deal.CloseDate) < new Date();
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
                    {deal.CloseDate ? format(new Date(deal.CloseDate), 'MMM d') : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SlidePanel>
  );
}
