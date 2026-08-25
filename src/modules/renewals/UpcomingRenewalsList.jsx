import { useState, useMemo, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { createPortal } from 'react-dom';
import { XMarkIcon, CheckCircleIcon, ExclamationCircleIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

function MultiSelect({ options, selected, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function toggle(val) {
    const next = new Set(selected);
    if (next.has(val)) next.delete(val); else next.add(val);
    onChange(next);
  }

  const label = selected.size === 0 ? placeholder
    : selected.size === 1 ? [...selected][0]
    : `${selected.size} tiers`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 border border-rs-border rounded px-2 py-1 text-xs text-rs-text bg-white hover:border-rs-teal/60 focus:outline-none"
      >
        <span>{label}</span>
        <ChevronDownIcon className="h-3 w-3 text-rs-muted" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-rs-border rounded shadow-lg min-w-[160px] py-1">
          {options.map(opt => (
            <label key={opt} className="flex items-center gap-2 px-3 py-1.5 text-xs text-rs-text hover:bg-rs-surface cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(opt)}
                onChange={() => toggle(opt)}
                className="accent-rs-teal"
              />
              {opt}
            </label>
          ))}
          {selected.size > 0 && (
            <button
              onClick={() => onChange(new Set())}
              className="w-full text-left px-3 py-1.5 text-xs text-rs-muted hover:text-rs-text hover:bg-rs-surface border-t border-rs-border mt-1"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function formatARR(v) {
  if (!v && v !== 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

function fmtDate(d) {
  if (!d) return '—';
  return format(new Date(d + 'T00:00:00'), 'MMM d, yyyy');
}

function compareValues(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

const COLS = [
  { key: 'accountName',     label: 'Client' },
  { key: 'nextRenewalDate', label: 'Renewal Date' },
  { key: 'renewalArr',      label: 'ARR' },
  { key: 'isAutoRenew',     label: 'Auto-Renew' },
  { key: 'sfStage',         label: 'SF Stage' },
];

// ── Subscription detail slide panel ──────────────────────────────────────────
function SubscriptionPanel({ row, onClose }) {
  const open = !!row;

  if (typeof document === 'undefined') return null;

  const totalArr = row?.arr || 0;
  const lines = row?.allLines?.length ? row.allLines : (row?.activeLines || []);
  const renewalDate = row?.nextRenewalDate;
  const daysUntil = row?.daysUntilRenewal;

  return createPortal(
    <>
      <div
        className={`fixed inset-0 bg-black/30 z-40 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div
        className={`fixed top-0 right-0 h-full bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ width: 480 }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-rs-border shrink-0 bg-rs-surface">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-rs-muted mb-0.5">Account</p>
            <h2 className="text-lg font-bold text-rs-text leading-tight truncate">{row?.accountName || '—'}</h2>
            {renewalDate && (
              <p className="text-xs text-rs-muted mt-1">
                Next renewal <span className="font-semibold text-rs-text">{fmtDate(renewalDate)}</span>
                {daysUntil != null && (
                  <span className={`ml-2 font-semibold ${daysUntil <= 30 ? 'text-red-600' : daysUntil <= 60 ? 'text-amber-600' : 'text-rs-muted'}`}>
                    ({daysUntil}d)
                  </span>
                )}
              </p>
            )}
          </div>
          <button onClick={onClose} className="ml-4 shrink-0 p-1 rounded hover:bg-rs-border text-rs-muted hover:text-rs-text transition-colors">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Total ARR banner */}
        <div className="px-5 py-3 border-b border-rs-border bg-white shrink-0">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-rs-muted mb-0.5">Total ARR</p>
              <p className="text-2xl font-bold text-rs-teal">{formatARR(totalArr)}</p>
            </div>
            <div className="w-px h-8 bg-rs-border" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-rs-muted mb-0.5">Active Lines</p>
              <p className="text-2xl font-bold text-rs-text">{lines.length}</p>
            </div>
            {row?.sfOpp && (
              <>
                <div className="w-px h-8 bg-rs-border" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-rs-muted mb-0.5">SF Stage</p>
                  <p className="text-sm font-semibold text-rs-teal">{row.sfOpp.StageName}</p>
                </div>
                {row.sfOpp.NextStep && (
                  <>
                    <div className="w-px h-8 bg-rs-border" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-rs-muted mb-0.5">Next Step</p>
                      <p className="text-xs text-rs-muted truncate">{row.sfOpp.NextStep}</p>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Subscription lines */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-rs-muted mb-3">Subscription Lines</p>
          <div className="space-y-3">
            {lines.map((line, i) => (
              <div key={i} className="rounded-xl border border-rs-border bg-white overflow-hidden">
                {/* Line header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-rs-border bg-rs-surface">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-sm text-rs-text truncate">{line.itemName || 'Module'}</span>
                    {line.cancelled
                      ? <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-white bg-red-400 px-1.5 py-0.5 rounded">Cancelled</span>
                      : !line.isActive
                        ? <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-white bg-amber-400 px-1.5 py-0.5 rounded">Expired</span>
                        : null
                    }
                  </div>
                  <span className={"text-sm font-bold shrink-0 " + (line.isActive ? "text-rs-text" : "text-rs-muted line-through")}>{formatARR(Number(line.home_arr_amount))}</span>
                </div>
                {/* Line details */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-rs-muted mb-0.5">Start Date</p>
                    <p className="text-sm text-rs-text">{fmtDate(line.start_date)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-rs-muted mb-0.5">Renewal Date</p>
                    <p className="text-sm font-semibold text-rs-text">{fmtDate(line.end_date)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-rs-muted mb-0.5">Auto-Renew</p>
                    <div className="flex items-center gap-1.5">
                      {line.is_autorenewal
                        ? <><CheckCircleIcon className="h-4 w-4 text-green-600" /><span className="text-sm font-medium text-green-700">Yes</span></>
                        : <><ExclamationCircleIcon className="h-4 w-4 text-orange-500" /><span className="text-sm font-medium text-orange-700">No — manual</span></>
                      }
                    </div>
                  </div>
                  {line.home_amount && Number(line.home_amount) !== Number(line.home_arr_amount) && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-rs-muted mb-0.5">Contract Value</p>
                      <p className="text-sm text-rs-text">{formatARR(Number(line.home_amount))}</p>
                    </div>
                  )}
                </div>
                {line.invoice_description && (
                  <div className="px-4 pb-3 border-t border-rs-border pt-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-rs-muted mb-0.5">Description</p>
                    <p className="text-xs text-rs-muted leading-relaxed">{line.invoice_description}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

export default function UpcomingRenewalsList({ rows }) {
  const [activeDetail, setActiveDetail] = useState(null);
  const [sortKey, setSortKey] = useState('nextRenewalDate');
  const [sortDir, setSortDir] = useState('asc');
  const [filterTiers, setFilterTiers] = useState(new Set());
  const [filterAutoRenew, setFilterAutoRenew] = useState('all');
  const [filterStage, setFilterStage] = useState('all');

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  const tierOptions = useMemo(() =>
    [...new Set(rows.map(r => r.tier).filter(t => t && !t.includes('Prospect')))].sort(),
    [rows]
  );

  const stageOptions = useMemo(() =>
    ['all', ...[...new Set(rows.map(r => r.sfOpp?.StageName).filter(Boolean))].sort()],
    [rows]
  );

  const displayRows = useMemo(() => {
    let out = rows;

    if (filterTiers.size > 0) out = out.filter(r => filterTiers.has(r.tier));
    if (filterAutoRenew === 'auto')   out = out.filter(r => r.isAutoRenew === true);
    if (filterAutoRenew === 'manual') out = out.filter(r => r.isAutoRenew === false);
    if (filterStage !== 'all') out = out.filter(r => r.sfOpp?.StageName === filterStage);

    return [...out].sort((a, b) => {
      const aVal = sortKey === 'sfStage' ? (a.sfOpp?.StageName ?? '')
                 : sortKey === 'renewalArr' ? (a.renewalArr ?? a.arr ?? 0)
                 : a[sortKey];
      const bVal = sortKey === 'sfStage' ? (b.sfOpp?.StageName ?? '')
                 : sortKey === 'renewalArr' ? (b.renewalArr ?? b.arr ?? 0)
                 : b[sortKey];
      const cmp = compareValues(aVal, bVal);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, filterTiers, filterAutoRenew, filterStage, sortKey, sortDir]);

  const totalArr = displayRows.reduce((s, r) => s + (r.renewalArr ?? r.arr ?? 0), 0);

  const selectCls = 'border border-rs-border rounded px-2 py-1 text-xs text-rs-text bg-white focus:outline-none focus:ring-1 focus:ring-rs-teal';

  return (
    <>
      <div className="rounded-card border border-rs-border bg-white overflow-hidden mb-6">
        <div className="flex items-center justify-between px-4 py-3 border-b border-rs-border">
          <div>
            <h3 className="text-sm font-semibold text-rs-text">Upcoming Renewals</h3>
            <p className="text-[10px] text-rs-muted mt-0.5">
              {displayRows.length} client{displayRows.length !== 1 ? 's' : ''} · {formatARR(totalArr)} total ARR
            </p>
          </div>
          {/* Filters */}
          <div className="flex items-center gap-2">
            <MultiSelect
              options={tierOptions}
              selected={filterTiers}
              onChange={setFilterTiers}
              placeholder="All Tiers"
            />
            <select value={filterAutoRenew} onChange={e => setFilterAutoRenew(e.target.value)} className={selectCls}>
              <option value="all">All Renewals</option>
              <option value="auto">Auto</option>
              <option value="manual">Manual</option>
            </select>
            <select value={filterStage} onChange={e => setFilterStage(e.target.value)} className={selectCls}>
              <option value="all">All Stages</option>
              {stageOptions.filter(s => s !== 'all').map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {displayRows.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-rs-muted">No upcoming renewals match these filters</div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                {COLS.map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className="bg-rs-teal text-white px-4 py-2 text-left text-xs font-semibold tracking-wide cursor-pointer select-none hover:bg-rs-teal/90"
                  >
                    {col.label}
                    {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, i) => (
                <tr
                  key={`${row.accountId}-${i}`}
                  onClick={() => setActiveDetail(row)}
                  className="border-b border-rs-border hover:bg-rs-surface cursor-pointer transition-colors"
                >
                  <td className="px-4 py-2.5 font-medium text-rs-text">{row.accountName}</td>
                  <td className="px-4 py-2.5 text-rs-muted whitespace-nowrap">
                    {row.nextRenewalDate
                      ? format(new Date(row.nextRenewalDate + 'T00:00:00'), 'MM.dd.yyyy')
                      : '—'}
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-rs-text">{formatARR(row.renewalArr ?? row.arr)}</td>
                  <td className="px-4 py-2.5">
                    {row.isAutoRenew == null
                      ? <span className="text-xs text-rs-muted">—</span>
                      : <span className={`text-xs font-medium ${row.isAutoRenew ? 'text-green-700' : 'text-orange-700'}`}>
                          {row.isAutoRenew ? 'Auto' : 'Manual'}
                        </span>
                    }
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {row.sfOpp
                      ? <span className="text-rs-teal font-medium">{row.sfOpp.StageName}</span>
                      : <span className="text-rs-muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <SubscriptionPanel row={activeDetail} onClose={() => setActiveDetail(null)} />
    </>
  );
}
