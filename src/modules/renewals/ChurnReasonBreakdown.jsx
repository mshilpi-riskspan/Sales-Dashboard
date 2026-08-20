import { useMemo, useState } from 'react';

function formatARR(v) {
  if (!v && v !== 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

export default function ChurnReasonBreakdown({ opps }) {
  const [sortBy, setSortBy] = useState('count');

  const reasons = useMemo(() => {
    const map = new Map();
    for (const d of opps) {
      const reason = d.Loss_Reason__c || 'Not Specified';
      const arr = d.Annual_Recurring_Revenue_ARR__c ?? d.Amount ?? 0;
      if (!map.has(reason)) map.set(reason, { reason, count: 0, arr: 0 });
      const entry = map.get(reason);
      entry.count++;
      entry.arr += arr;
    }
    const rows = Array.from(map.values());
    return sortBy === 'arr'
      ? rows.sort((a, b) => b.arr - a.arr)
      : rows.sort((a, b) => b.count - a.count);
  }, [opps, sortBy]);

  if (!opps.length) return null;

  const maxCount = reasons[0]?.count || 1;
  const maxArr = [...reasons].sort((a, b) => b.arr - a.arr)[0]?.arr || 1;

  return (
    <div className="rounded-card border border-rs-border bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-rs-border">
        <h3 className="text-sm font-semibold text-rs-text">Churn Reasons</h3>
        <div className="flex gap-1">
          {[['count', 'By Count'], ['arr', 'By ARR']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setSortBy(val)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                sortBy === val
                  ? 'bg-rs-teal text-white'
                  : 'text-rs-muted hover:text-rs-text hover:bg-rs-surface'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 py-3 space-y-3">
        {reasons.map(({ reason, count, arr }) => {
          const pct = sortBy === 'arr' ? (arr / maxArr) * 100 : (count / maxCount) * 100;
          return (
            <div key={reason}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-rs-muted truncate max-w-[180px]" title={reason}>{reason}</span>
                <div className="flex items-center gap-3 text-xs shrink-0">
                  <span className="text-rs-muted">{count} deal{count !== 1 ? 's' : ''}</span>
                  <span className="font-semibold text-rs-text">{formatARR(arr)}</span>
                </div>
              </div>
              <div className="h-2 bg-rs-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-400 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
