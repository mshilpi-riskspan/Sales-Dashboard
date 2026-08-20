import { useState } from 'react';
import { format } from 'date-fns';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import DealDetailPanel from '../../components/common/DealDetailPanel';

function formatARR(v) {
  if (!v && v !== 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

export default function ChurnedClientsList({ opps }) {
  const [expanded, setExpanded] = useState(true);
  const [activeDeal, setActiveDeal] = useState(null);

  const totalArr = opps.reduce((s, d) => s + (d.Annual_Recurring_Revenue_ARR__c ?? d.Amount ?? 0), 0);

  return (
    <>
      <div className="rounded-card border border-red-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-red-100 bg-red-50">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <div>
              <h3 className="text-sm font-semibold text-red-700">Churned Renewals</h3>
              <p className="text-[10px] text-rs-muted mt-0.5">Closed-lost renewal opportunities</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
              {opps.length} deal{opps.length !== 1 ? 's' : ''}
            </span>
            {totalArr > 0 && (
              <span className="text-xs font-semibold text-rs-text">{formatARR(totalArr)}</span>
            )}
            <button onClick={() => setExpanded(e => !e)} className="text-rs-muted hover:text-rs-text transition-colors">
              {expanded ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {expanded && (
          opps.length === 0 ? (
            <div className="px-4 py-5 text-center text-xs text-rs-muted">No churned renewals found</div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  {['Account', 'ARR Lost', 'Owner', 'Churn Date', 'Loss Reason', 'Explanation'].map(h => (
                    <th key={h} className="bg-red-600 text-white px-3 py-2 text-left text-xs font-semibold tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {opps.map(deal => {
                  const arr = deal.Annual_Recurring_Revenue_ARR__c ?? deal.Amount ?? 0;
                  return (
                    <tr
                      key={deal.Id}
                      onClick={() => setActiveDeal(deal)}
                      className="border-b border-rs-border hover:bg-rs-surface cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2 font-medium text-rs-text">{deal.Account?.Name || '—'}</td>
                      <td className="px-3 py-2 font-semibold text-red-600">{formatARR(arr)}</td>
                      <td className="px-3 py-2 text-rs-muted">{deal.Owner?.Name || '—'}</td>
                      <td className="px-3 py-2 text-rs-muted whitespace-nowrap">
                        {deal.CloseDate ? format(new Date(deal.CloseDate + 'T00:00:00'), 'MMM d, yyyy') : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-rs-muted">{deal.Loss_Reason__c || '—'}</td>
                      <td className="px-3 py-2 text-xs text-rs-muted max-w-xs">
                        {deal.Closed_Lost_Reason_Explanation__c ? (
                          <span className="line-clamp-2" title={deal.Closed_Lost_Reason_Explanation__c}>
                            {deal.Closed_Lost_Reason_Explanation__c}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}
      </div>

      <DealDetailPanel deal={activeDeal} onClose={() => setActiveDeal(null)} />
    </>
  );
}
