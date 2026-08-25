import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import DealDetailPanel from '../../components/common/DealDetailPanel';

function formatARR(v) {
  if (!v && v !== 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

function compareValues(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

const COLS = [
  { key: 'accountName',    label: 'Account',      sortable: true },
  { key: 'arr',            label: 'ARR Lost',     sortable: true },
  { key: 'ownerName',      label: 'Owner',        sortable: true },
  { key: 'CloseDate',      label: 'Churn Date',   sortable: true },
  { key: 'Loss_Reason__c', label: 'Loss Reason',  sortable: true },
  { key: 'explanation',    label: 'Explanation',  sortable: false },
];

export default function ChurnedClientsList({ opps }) {
  const [expanded, setExpanded] = useState(true);
  const [activeDeal, setActiveDeal] = useState(null);
  const [sortKey, setSortKey] = useState('CloseDate');
  const [sortDir, setSortDir] = useState('desc');
  const [filterReason, setFilterReason] = useState('all');
  const [filterYear, setFilterYear] = useState('all');

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  const reasonOptions = useMemo(() =>
    ['all', ...[...new Set(opps.map(o => o.Loss_Reason__c).filter(Boolean))].sort()],
    [opps]
  );

  const yearOptions = useMemo(() => {
    const years = [...new Set(opps.map(o => o.CloseDate?.slice(0, 4)).filter(Boolean))].sort().reverse();
    return ['all', ...years];
  }, [opps]);

  const displayOpps = useMemo(() => {
    let out = opps;

    if (filterReason !== 'all') out = out.filter(o => o.Loss_Reason__c === filterReason);
    if (filterYear !== 'all')   out = out.filter(o => o.CloseDate?.startsWith(filterYear));

    return [...out].sort((a, b) => {
      let aVal, bVal;
      if (sortKey === 'accountName') { aVal = a.Account?.Name; bVal = b.Account?.Name; }
      else if (sortKey === 'arr')    { aVal = a.Annual_Recurring_Revenue_ARR__c ?? a.Amount ?? 0; bVal = b.Annual_Recurring_Revenue_ARR__c ?? b.Amount ?? 0; }
      else if (sortKey === 'ownerName') { aVal = a.Owner?.Name; bVal = b.Owner?.Name; }
      else { aVal = a[sortKey]; bVal = b[sortKey]; }
      const cmp = compareValues(aVal, bVal);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [opps, filterReason, filterYear, sortKey, sortDir]);

  const totalArr = displayOpps.reduce((s, d) => s + (d.Annual_Recurring_Revenue_ARR__c ?? d.Amount ?? 0), 0);

  const selectCls = 'border border-red-200 rounded px-2 py-1 text-xs text-rs-text bg-white focus:outline-none focus:ring-1 focus:ring-red-400';

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
          <div className="flex items-center gap-2">
            {/* Filters */}
            <select value={filterReason} onChange={e => setFilterReason(e.target.value)} className={selectCls}>
              <option value="all">All Reasons</option>
              {reasonOptions.filter(r => r !== 'all').map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <select value={filterYear} onChange={e => setFilterYear(e.target.value)} className={selectCls}>
              <option value="all">All Years</option>
              {yearOptions.filter(y => y !== 'all').map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <span className="text-xs font-semibold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
              {displayOpps.length} deal{displayOpps.length !== 1 ? 's' : ''}
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
          displayOpps.length === 0 ? (
            <div className="px-4 py-5 text-center text-xs text-rs-muted">No churned renewals match these filters</div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  {COLS.map(col => (
                    <th
                      key={col.key}
                      onClick={col.sortable ? () => handleSort(col.key) : undefined}
                      className={`bg-red-600 text-white px-3 py-2 text-left text-xs font-semibold tracking-wide ${col.sortable ? 'cursor-pointer select-none hover:bg-red-700' : ''}`}
                    >
                      {col.label}
                      {col.sortable && sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayOpps.map(deal => {
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
