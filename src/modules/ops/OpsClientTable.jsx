import { useState, useMemo } from 'react';

function compareValues(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

function HealthBar({ pct }) {
  if (pct == null) return <span className="text-xs text-rs-muted">—</span>;
  const color = pct >= 90 ? 'bg-green-400' : pct >= 70 ? 'bg-amber-400' : 'bg-red-400';
  const text  = pct >= 90 ? 'text-green-700' : pct >= 70 ? 'text-amber-700' : 'text-red-600';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-rs-surface overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={`text-xs font-medium ${text}`}>{pct}%</span>
    </div>
  );
}

function StateBadge({ state }) {
  if (!state) return <span className="text-xs text-rs-muted">—</span>;
  const cls = state === 'success' ? 'bg-green-100 text-green-700'
            : state === 'failed'  ? 'bg-red-100 text-red-600'
            : 'bg-slate-100 text-slate-600';
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize ${cls}`}>{state}</span>;
}

function WowBadge({ delta }) {
  if (delta == null) return <span className="text-xs text-rs-muted">—</span>;
  const up = delta >= 0;
  return (
    <span className={`text-xs font-semibold ${up ? 'text-green-600' : 'text-red-500'}`}>
      {up ? '↑' : '↓'} {Math.abs(delta)}pp
    </span>
  );
}

const COLS = [
  { key: 'accountName', label: 'Client' },
  { key: 'tier',        label: 'Tier' },
  { key: 'dagCount',    label: 'DAGs' },
  { key: 'lastRunState', label: 'Last Run' },
  { key: 'lastRunDate', label: 'Last Run Date' },
  { key: 'today',       label: 'Today S / F', sortable: false },
  { key: 'healthPct7d', label: '7-day Health' },
  { key: 'healthPct30d', label: '30-day Health' },
  { key: 'wowDelta',    label: 'WoW' },
];

export default function OpsClientTable({ rows, onRowClick }) {
  const [sortKey, setSortKey] = useState('healthPct7d');
  const [sortDir, setSortDir] = useState('asc');

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const cmp = compareValues(a[sortKey], b[sortKey]);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir]);

  if (sorted.length === 0) {
    return <div className="px-4 py-10 text-center text-sm text-rs-muted">No clients found for this product</div>;
  }

  return (
    <div className="rounded-card border border-rs-border bg-white overflow-hidden">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {COLS.map((col) => {
              const sortable = col.sortable !== false;
              return (
                <th
                  key={col.key}
                  onClick={sortable ? () => handleSort(col.key) : undefined}
                  className={`bg-rs-teal text-white px-4 py-2 text-left text-xs font-semibold tracking-wide whitespace-nowrap ${sortable ? 'cursor-pointer select-none hover:bg-rs-teal/90' : ''}`}
                >
                  {col.label}
                  {sortable && sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={row.accountId}
              onClick={() => onRowClick?.(row)}
              className="border-b border-rs-border hover:bg-rs-surface cursor-pointer transition-colors"
            >
              <td className="px-4 py-2.5 font-medium text-rs-text">{row.accountName}</td>
              <td className="px-4 py-2.5 text-xs text-rs-muted">{row.tier ?? '—'}</td>
              <td className="px-4 py-2.5 text-rs-text">{row.dagCount}</td>
              <td className="px-4 py-2.5"><StateBadge state={row.lastRunState} /></td>
              <td className="px-4 py-2.5 text-xs text-rs-muted whitespace-nowrap">{row.lastRunDate ?? '—'}</td>
              <td className="px-4 py-2.5 text-xs text-rs-muted">{row.todaySuccess} / {row.todayFailed}</td>
              <td className="px-4 py-2.5"><HealthBar pct={row.healthPct7d} /></td>
              <td className="px-4 py-2.5"><HealthBar pct={row.healthPct30d} /></td>
              <td className="px-4 py-2.5"><WowBadge delta={row.wowDelta} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
