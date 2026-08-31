import { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { fetchFreshdeskData } from '../../datasources/freshdesk';
import { fetchJiraData } from '../../datasources/jira';
import { useSalesforceQuery } from '../../hooks/useSalesforceQuery';
import { useDashboard } from '../../context/DashboardContext';
import KpiCard from '../../components/common/KpiCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorState from '../../components/common/ErrorState';
import TicketDrillPanel from './TicketDrillPanel';

// --- Constants ---
const ADMIN_TYPES = new Set([
  'Invalid Incident', 'Account Related', 'Account Related / Audit',
  'Create New User(s)', 'Server Issue', 'Problem - Server Issue',
]);

const FD_STATUS_LABELS = {
  2: 'Open', 3: 'Pending', 4: 'Resolved', 5: 'Closed',
  6: 'Working on Query', 7: 'Waiting on Customer', 10: 'Pending LVL3/EDGE',
};

const RANGE_OPTS = [
  { key: '30', label: '1M' },
  { key: '90', label: '3M' },
  { key: '180', label: '6M' },
  { key: '365', label: '1Y' },
];

const CAT_COLORS = { l3edge: '#8B5CF6', admin: '#FFA91D', substantive: '#0C8EA3' };
const CAT_LABELS  = { l3edge: 'L3 + Edge', admin: 'Admin / Overhead', substantive: 'Substantive' };

// --- Helpers ---
function categorize(t) {
  const tags = t.tags || [];
  if (tags.some((tag) => tag.startsWith('LVL3-'))) return 'l3';
  if (tags.some((tag) => tag.startsWith('EDGE-'))) return 'edge';
  if (ADMIN_TYPES.has(t.type)) return 'admin';
  return 'substantive';
}

const isResolved = (t) => t.status === 4 || t.status === 5;
const isOpen     = (t) => !isResolved(t);

function pct(num, denom) {
  return denom ? Math.round((num / denom) * 100) : 0;
}

function outstandingStats(tickets) {
  const open = tickets.filter(isOpen);
  const byStatus = {};
  for (const t of open) {
    const label = FD_STATUS_LABELS[t.status] || `Status ${t.status}`;
    byStatus[label] = (byStatus[label] || 0) + 1;
  }
  return {
    total: tickets.length,
    openCount: open.length,
    openPct: pct(open.length, tickets.length),
    byStatus: Object.entries(byStatus).sort((a, b) => b[1] - a[1]),
  };
}

// --- Sub-components ---
function ResolutionBar({ resolved, total }) {
  const p = total ? Math.round((resolved / total) * 100) : 0;
  const bar = p >= 90 ? 'bg-green-400' : p >= 70 ? 'bg-amber-400' : 'bg-red-400';
  const txt = p >= 90 ? 'text-green-700' : p >= 70 ? 'text-amber-700' : 'text-red-600';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-rs-surface overflow-hidden">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${p}%` }} />
      </div>
      <span className={`text-xs font-medium tabular-nums ${txt}`}>{p}%</span>
    </div>
  );
}

function SortTh({ label, sortKey, active, dir, onSort }) {
  return (
    <th
      onClick={() => onSort(sortKey)}
      className="px-3 py-2 text-left text-xs font-semibold text-white cursor-pointer select-none hover:bg-rs-teal/90 whitespace-nowrap"
    >
      {label}{active ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  );
}

function StaticTh({ label, className = '' }) {
  return <th className={`px-3 py-2 text-left text-xs font-semibold text-white whitespace-nowrap ${className}`}>{label}</th>;
}

// --- Main Component ---
export default function FreshdeskDashboard() {
  const { triggerRefresh } = useDashboard();
  const fdQ   = useSalesforceQuery(fetchFreshdeskData);
  const jiraQ = useSalesforceQuery(fetchJiraData);

  const [daysBack, setDaysBack] = useState('30');
  const [drill, setDrill]       = useState(null); // { tickets, title } or null
  const [l3Sort,  setL3Sort]    = useState({ key: 'total', dir: 'desc' });
  const [subSort, setSubSort]   = useState({ key: 'count', dir: 'desc' });

  const tickets    = fdQ.data?.tickets   ?? [];
  const jiraIssues = jiraQ.data?.issues  ?? [];

  // Date-range filter
  const filtered = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - parseInt(daysBack, 10));
    return tickets.filter((t) => t.created_at && new Date(t.created_at) >= cutoff);
  }, [tickets, daysBack]);

  // Categorize
  const cats = useMemo(() => {
    const l3 = [], edge = [], admin = [], substantive = [];
    for (const t of filtered) {
      const c = categorize(t);
      if (c === 'l3') l3.push(t);
      else if (c === 'edge') edge.push(t);
      else if (c === 'admin') admin.push(t);
      else substantive.push(t);
    }
    return { l3, edge, admin, substantive, l3edge: [...l3, ...edge] };
  }, [filtered]);

  // KPIs
  const kpis = useMemo(() => {
    const l3edgeResolved = cats.l3edge.filter(isResolved).length;
    const l3edgeOpen     = cats.l3edge.filter(isOpen).length;
    return {
      total:          filtered.length,
      l3edgeCount:    cats.l3edge.length,
      l3edgePct:      pct(cats.l3edge.length, filtered.length),
      l3edgeResPct:   pct(l3edgeResolved, cats.l3edge.length),
      l3edgeResolved,
      l3edgeOpen,
      adminCount:     cats.admin.length,
      adminPct:       pct(cats.admin.length, filtered.length),
    };
  }, [filtered, cats]);

  // Donut data — order matches the visual reference
  const pieData = useMemo(() => [
    { key: 'substantive', name: 'Substantive',     value: cats.substantive.length, color: CAT_COLORS.substantive },
    { key: 'admin',       name: 'Admin / Overhead', value: cats.admin.length,       color: CAT_COLORS.admin },
    { key: 'l3edge',      name: 'L3 + Edge',        value: cats.l3edge.length,      color: CAT_COLORS.l3edge },
  ].filter((d) => d.value > 0), [cats]);

  // Admin breakdown by type
  const adminByType = useMemo(() => {
    const map = new Map();
    for (const t of cats.admin) {
      const type = t.type || 'Other';
      map.set(type, (map.get(type) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, count }));
  }, [cats.admin]);

  // L3/Edge by type
  const l3edgeByType = useMemo(() => {
    const map = new Map();
    for (const t of cats.l3edge) {
      const type    = t.type || 'Other';
      const isEdge  = (t.tags || []).some((tag) => tag.startsWith('EDGE-'));
      if (!map.has(type)) map.set(type, { type, total: 0, lvl3: 0, edge: 0, open: 0, resolved: 0 });
      const e = map.get(type);
      e.total++;
      isEdge ? e.edge++ : e.lvl3++;
      isResolved(t) ? e.resolved++ : e.open++;
    }
    return [...map.values()];
  }, [cats.l3edge]);

  // Substantive by type
  const substantiveByType = useMemo(() => {
    const map = new Map();
    for (const t of cats.substantive) {
      const type = t.type || 'Other';
      if (!map.has(type)) map.set(type, { type, count: 0, resolved: 0, open: 0 });
      const e = map.get(type);
      e.count++;
      isResolved(t) ? e.resolved++ : e.open++;
    }
    return [...map.values()];
  }, [cats.substantive]);

  // Outstanding stats per category
  const outstanding = useMemo(() => ({
    l3edge:      outstandingStats(cats.l3edge),
    admin:       outstandingStats(cats.admin),
    substantive: outstandingStats(cats.substantive),
  }), [cats]);

  // All open tickets for the share bar
  const allOpen = useMemo(() => filtered.filter(isOpen), [filtered]);

  // Sorted tables
  function sortRows(rows, key, dir) {
    return [...rows].sort((a, b) => {
      const av = a[key] ?? 0, bv = b[key] ?? 0;
      if (typeof av === 'string') return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return dir === 'asc' ? av - bv : bv - av;
    });
  }

  function toggleL3Sort(key) {
    setL3Sort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  }
  function toggleSubSort(key) {
    setSubSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  }

  const sortedL3  = useMemo(() => sortRows(l3edgeByType,    l3Sort.key,  l3Sort.dir),  [l3edgeByType,    l3Sort]);
  const sortedSub = useMemo(() => sortRows(substantiveByType, subSort.key, subSort.dir), [substantiveByType, subSort]);

  const rangeLabel = RANGE_OPTS.find((o) => o.key === daysBack)?.label ?? '1M';

  if (fdQ.loading) {
    return <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>;
  }
  if (fdQ.error) {
    return <ErrorState message={fdQ.error} onRetry={triggerRefresh} />;
  }

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-rs-text">Support Tickets</h2>
          <p className="text-xs text-rs-muted mt-0.5">{filtered.length} tickets · Freshdesk</p>
        </div>
        <div className="flex gap-1 bg-rs-surface rounded-lg p-1">
          {RANGE_OPTS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setDaysBack(opt.key)}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                daysBack === opt.key
                  ? 'bg-white text-rs-teal shadow-sm border border-rs-border'
                  : 'text-rs-muted hover:text-rs-text'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI Strip ──────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <KpiCard
          title="Total Tickets"
          value={kpis.total}
          subtitle={`Last ${rangeLabel}`}
          onClick={() => setDrill({ tickets: filtered, title: 'All Tickets' })}
        />
        <KpiCard
          title="L3 + Edge"
          value={kpis.l3edgeCount}
          subtitle={`${kpis.l3edgePct}% of total`}
          onClick={() => setDrill({ tickets: cats.l3edge, title: 'L3 + Edge Tickets' })}
        />
        <KpiCard
          title="L3 / Edge Resolved"
          value={`${kpis.l3edgeResPct}%`}
          subtitle={`${kpis.l3edgeResolved} closed · ${kpis.l3edgeOpen} open`}
          onClick={() => setDrill({ tickets: cats.l3edge.filter(isResolved), title: 'L3 / Edge — Resolved' })}
        />
        <KpiCard
          title="Admin / Overhead"
          value={kpis.adminCount}
          subtitle={`${kpis.adminPct}% of total`}
          onClick={() => setDrill({ tickets: cats.admin, title: 'Admin / Overhead Tickets' })}
        />
      </div>

      {/* ── Row 1: Donut | Admin Breakdown | L3/Edge Detail ── */}
      <div className="grid grid-cols-3 gap-4 mb-4">

        {/* Category donut */}
        <div className="rounded-xl border border-rs-border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-rs-border">
            <h3 className="text-xs font-semibold text-rs-text uppercase tracking-wide">Category Split</h3>
          </div>
          <div className="p-4">
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%" cy="50%"
                    innerRadius={52} outerRadius={78}
                    paddingAngle={2}
                    dataKey="value"
                    onClick={(d) => setDrill({ tickets: cats[d.key], title: CAT_LABELS[d.key] })}
                    style={{ cursor: 'pointer' }}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #DADEE5' }}
                    formatter={(value, name) => [`${value} (${pct(value, filtered.length)}%)`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1 mt-1">
              {pieData.map((d) => (
                <button
                  key={d.key}
                  onClick={() => setDrill({ tickets: cats[d.key], title: CAT_LABELS[d.key] })}
                  className="flex items-center justify-between w-full text-xs hover:bg-rs-surface rounded px-1 py-0.5 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="text-rs-text">{d.name}</span>
                  </div>
                  <span className="text-rs-muted font-medium tabular-nums">{d.value} · {pct(d.value, filtered.length)}%</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Admin/Overhead breakdown */}
        <div className="rounded-xl border border-rs-border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-rs-border">
            <h3 className="text-xs font-semibold text-rs-text uppercase tracking-wide">
              Admin / Overhead Breakdown
              <span className="ml-2 font-normal text-rs-muted normal-case">— {kpis.adminCount} tickets ({kpis.adminPct}%)</span>
            </h3>
          </div>
          <div className="p-4 space-y-3">
            {adminByType.length === 0 ? (
              <p className="text-xs text-rs-muted">No admin tickets in this period.</p>
            ) : adminByType.map(({ type, count }) => (
              <button
                key={type}
                onClick={() => setDrill({
                  tickets: cats.admin.filter((t) => (t.type || 'Other') === type),
                  title: `Admin: ${type}`,
                })}
                className="w-full text-left group"
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-rs-text font-medium group-hover:text-rs-teal transition-colors">{type}</span>
                  <span className="text-rs-muted tabular-nums">{count} · {pct(count, kpis.adminCount)}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-rs-surface overflow-hidden">
                  <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct(count, kpis.adminCount)}%` }} />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* L3/Edge detail */}
        <div className="rounded-xl border border-rs-border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-rs-border">
            <h3 className="text-xs font-semibold text-rs-text uppercase tracking-wide">L3 & Edge Detail</h3>
          </div>
          <div className="p-4 space-y-4">
            {/* Composition stacked bar */}
            <div>
              <p className="text-[10px] font-semibold text-rs-muted uppercase tracking-wide mb-1.5">
                Composition — {kpis.l3edgeCount} tickets
              </p>
              {kpis.l3edgeCount === 0 ? (
                <div className="h-5 rounded bg-rs-surface" />
              ) : (
                <div className="flex h-5 rounded overflow-hidden gap-px">
                  {cats.l3.length > 0 && (
                    <button
                      onClick={() => setDrill({ tickets: cats.l3, title: 'LVL3 Tickets' })}
                      className="flex items-center justify-center text-[9px] font-bold text-white bg-purple-500 hover:bg-purple-600 transition-colors"
                      style={{ width: `${pct(cats.l3.length, kpis.l3edgeCount)}%` }}
                    >
                      LVL3 · {cats.l3.length}
                    </button>
                  )}
                  {cats.edge.length > 0 && (
                    <button
                      onClick={() => setDrill({ tickets: cats.edge, title: 'Edge Tickets' })}
                      className="flex-1 flex items-center justify-center text-[9px] font-bold text-white bg-violet-400 hover:bg-violet-500 transition-colors"
                    >
                      Edge · {cats.edge.length}
                    </button>
                  )}
                </div>
              )}
              <div className="flex gap-3 mt-1 text-[10px] text-rs-muted">
                <span><span className="inline-block w-2 h-2 rounded-full bg-purple-500 mr-1" />LVL3 — {cats.l3.length}</span>
                <span><span className="inline-block w-2 h-2 rounded-full bg-violet-400 mr-1" />Edge — {cats.edge.length}</span>
              </div>
            </div>

            {/* Resolution stacked bar */}
            <div>
              <p className="text-[10px] font-semibold text-rs-muted uppercase tracking-wide mb-1.5">Resolution Status</p>
              {kpis.l3edgeCount === 0 ? (
                <div className="h-5 rounded bg-rs-surface" />
              ) : (
                <div className="flex h-5 rounded overflow-hidden gap-px">
                  {kpis.l3edgeResolved > 0 && (
                    <button
                      onClick={() => setDrill({ tickets: cats.l3edge.filter(isResolved), title: 'L3 / Edge — Resolved' })}
                      className="flex items-center justify-center text-[9px] font-bold text-white bg-green-500 hover:bg-green-600 transition-colors"
                      style={{ width: `${kpis.l3edgeResPct}%` }}
                    >
                      {kpis.l3edgeResPct > 15 && `Resolved · ${kpis.l3edgeResolved}`}
                    </button>
                  )}
                  {kpis.l3edgeOpen > 0 && (
                    <button
                      onClick={() => setDrill({ tickets: cats.l3edge.filter(isOpen), title: 'L3 / Edge — Open' })}
                      className="flex-1 flex items-center justify-center text-[9px] font-bold text-white bg-red-400 hover:bg-red-500 transition-colors"
                    >
                      Open · {kpis.l3edgeOpen}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="text-center pt-1">
              <p className="text-3xl font-bold text-rs-text">{kpis.l3edgeResPct}%</p>
              <p className="text-[11px] text-rs-muted">{kpis.l3edgeResolved} resolved · {kpis.l3edgeOpen} still open</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 2: Outstanding by Category ─────────────────── */}
      <div className="rounded-xl border border-rs-border bg-white overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-rs-border">
          <h3 className="text-xs font-semibold text-rs-text uppercase tracking-wide">
            Outstanding by Category · {rangeLabel}
          </h3>
        </div>
        <div className="grid grid-cols-3 divide-x divide-rs-border">
          {[
            { key: 'l3edge',      label: 'L3 & Edge',         tickets: cats.l3edge,      color: CAT_COLORS.l3edge      },
            { key: 'admin',       label: 'Admin / Overhead',   tickets: cats.admin,        color: CAT_COLORS.admin       },
            { key: 'substantive', label: 'Substantive',        tickets: cats.substantive,  color: CAT_COLORS.substantive },
          ].map(({ key, label, tickets: catTickets, color }) => {
            const stats = outstanding[key];
            return (
              <div key={key} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-rs-text">{label}</p>
                  <p className="text-xs text-rs-muted">{stats.openCount} / {stats.total}</p>
                </div>
                <p className="text-3xl font-bold mb-2" style={{ color }}>{stats.openPct}%</p>
                <div className="w-full h-1.5 rounded-full bg-rs-surface overflow-hidden mb-3">
                  <div className="h-full rounded-full" style={{ width: `${stats.openPct}%`, backgroundColor: color }} />
                </div>
                <div className="space-y-0.5">
                  {stats.byStatus.map(([statusLabel, count]) => (
                    <button
                      key={statusLabel}
                      onClick={() => setDrill({
                        tickets: catTickets.filter(
                          (t) => isOpen(t) && (FD_STATUS_LABELS[t.status] || `Status ${t.status}`) === statusLabel
                        ),
                        title: `${label} — ${statusLabel}`,
                      })}
                      className="flex items-center justify-between w-full text-[10px] hover:bg-rs-surface rounded px-0.5 py-0.5 transition-colors"
                    >
                      <span className="text-rs-text">{statusLabel}</span>
                      <span className="text-rs-muted font-medium">{count}</span>
                    </button>
                  ))}
                  {stats.byStatus.length === 0 && (
                    <p className="text-[10px] font-semibold text-green-600">Fully cleared</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Row 3: Outstanding share bar ───────────────────── */}
      {allOpen.length > 0 && (() => {
        const segments = [
          { key: 'l3edge',      label: 'L3/Edge',      openTickets: cats.l3edge.filter(isOpen) },
          { key: 'substantive', label: 'Substantive',   openTickets: cats.substantive.filter(isOpen) },
          { key: 'admin',       label: 'Admin',         openTickets: cats.admin.filter(isOpen) },
        ].filter((s) => s.openTickets.length > 0);

        return (
          <div className="rounded-xl border border-rs-border bg-white px-4 py-4 mb-6">
            <p className="text-[10px] font-semibold text-rs-muted uppercase tracking-wide mb-2">
              Outstanding share — {allOpen.length} open tickets
            </p>
            <div className="flex h-6 rounded overflow-hidden gap-px">
              {segments.map(({ key, label, openTickets }) => {
                const p = pct(openTickets.length, allOpen.length);
                return (
                  <button
                    key={key}
                    onClick={() => setDrill({ tickets: openTickets, title: `Open — ${CAT_LABELS[key]}` })}
                    className="flex items-center justify-center text-[9px] font-bold text-white hover:opacity-90 transition-opacity"
                    style={{ width: `${p}%`, backgroundColor: CAT_COLORS[key] }}
                    title={`${label}: ${openTickets.length} (${p}%)`}
                  >
                    {p > 12 && `${label} ${p}%`}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-4 mt-2 text-[10px] text-rs-muted">
              {segments.map(({ key, label, openTickets }) => (
                <span key={key} className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: CAT_COLORS[key] }} />
                  {label}: {openTickets.length} ({pct(openTickets.length, allOpen.length)}%)
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Row 4: L3/Edge by Type table ───────────────────── */}
      {l3edgeByType.length > 0 && (
        <div className="rounded-xl border border-rs-border bg-white overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-rs-border">
            <h3 className="text-xs font-semibold text-rs-text uppercase tracking-wide">
              L3 & Edge by Type
              <span className="ml-2 font-normal text-rs-muted normal-case">— {kpis.l3edgeCount} total · LVL3: {cats.l3.length} · Edge: {cats.edge.length}</span>
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-rs-teal">
                  <SortTh label="Ticket Type"    sortKey="type"     active={l3Sort.key === 'type'}     dir={l3Sort.dir} onSort={toggleL3Sort} />
                  <SortTh label="Total"          sortKey="total"    active={l3Sort.key === 'total'}    dir={l3Sort.dir} onSort={toggleL3Sort} />
                  <StaticTh label="% of L3/Edge" />
                  <StaticTh label="LVL3 / Edge" />
                  <StaticTh label="% Edge" />
                  <SortTh label="Open"           sortKey="open"     active={l3Sort.key === 'open'}     dir={l3Sort.dir} onSort={toggleL3Sort} />
                  <StaticTh label="Resolution" />
                  <SortTh label="Resolved"       sortKey="resolved" active={l3Sort.key === 'resolved'} dir={l3Sort.dir} onSort={toggleL3Sort} />
                </tr>
              </thead>
              <tbody>
                {sortedL3.map((row) => (
                  <tr
                    key={row.type}
                    onClick={() => setDrill({
                      tickets: cats.l3edge.filter((t) => (t.type || 'Other') === row.type),
                      title: `L3 / Edge: ${row.type}`,
                    })}
                    className="border-b border-rs-border hover:bg-rs-surface cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2.5 font-medium text-rs-text">{row.type}</td>
                    <td className="px-3 py-2.5 text-rs-text">{row.total}</td>
                    <td className="px-3 py-2.5 text-rs-muted">{pct(row.total, kpis.l3edgeCount)}%</td>
                    <td className="px-3 py-2.5">
                      <div className="flex h-4 rounded overflow-hidden gap-px w-20">
                        {row.lvl3 > 0 && (
                          <div className="flex items-center justify-center text-[9px] font-bold text-white bg-purple-500" style={{ width: `${pct(row.lvl3, row.total)}%` }}>
                            {row.lvl3}
                          </div>
                        )}
                        {row.edge > 0 && (
                          <div className="flex-1 flex items-center justify-center text-[9px] font-bold text-white bg-violet-400">
                            {row.edge}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-rs-muted">{pct(row.edge, row.total)}%</td>
                    <td className="px-3 py-2.5 text-rs-text">{row.open}</td>
                    <td className="px-3 py-2.5"><ResolutionBar resolved={row.resolved} total={row.total} /></td>
                    <td className="px-3 py-2.5 text-rs-text">{row.resolved} / {row.total}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-rs-border bg-rs-surface font-semibold">
                  <td className="px-3 py-2 text-rs-text">TOTAL</td>
                  <td className="px-3 py-2 text-rs-text">{kpis.l3edgeCount}</td>
                  <td className="px-3 py-2 text-rs-muted">100%</td>
                  <td className="px-3 py-2 text-[10px] text-rs-muted">{cats.l3.length} LVL3 · {cats.edge.length} Edge</td>
                  <td className="px-3 py-2 text-rs-muted">{pct(cats.edge.length, kpis.l3edgeCount)}%</td>
                  <td className="px-3 py-2 text-rs-text">{outstanding.l3edge.openCount}</td>
                  <td className="px-3 py-2"><ResolutionBar resolved={kpis.l3edgeResolved} total={kpis.l3edgeCount} /></td>
                  <td className="px-3 py-2 text-rs-text">{kpis.l3edgeResolved} / {kpis.l3edgeCount} ({outstanding.l3edge.openCount} open)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Row 5: Substantive by Type table ───────────────── */}
      {substantiveByType.length > 0 && (
        <div className="rounded-xl border border-rs-border bg-white overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-rs-border">
            <h3 className="text-xs font-semibold text-rs-text uppercase tracking-wide">
              Substantive Ticket Types
              <span className="ml-2 font-normal text-rs-muted normal-case">— {cats.substantive.length} tickets (admin & escalations excluded)</span>
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-rs-teal">
                  <SortTh label="Ticket Type"   sortKey="type"     active={subSort.key === 'type'}     dir={subSort.dir} onSort={toggleSubSort} />
                  <SortTh label="Count"         sortKey="count"    active={subSort.key === 'count'}    dir={subSort.dir} onSort={toggleSubSort} />
                  <StaticTh label={`% of ${filtered.length}`} />
                  <StaticTh label="Resolution Rate" className="w-36" />
                  <SortTh label="Resolved"      sortKey="resolved" active={subSort.key === 'resolved'} dir={subSort.dir} onSort={toggleSubSort} />
                  <SortTh label="Open"          sortKey="open"     active={subSort.key === 'open'}     dir={subSort.dir} onSort={toggleSubSort} />
                </tr>
              </thead>
              <tbody>
                {sortedSub.map((row) => (
                  <tr
                    key={row.type}
                    onClick={() => setDrill({
                      tickets: cats.substantive.filter((t) => (t.type || 'Other') === row.type),
                      title: `Substantive: ${row.type}`,
                    })}
                    className="border-b border-rs-border hover:bg-rs-surface cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2.5 font-medium text-rs-text">{row.type}</td>
                    <td className="px-3 py-2.5 text-rs-text">{row.count}</td>
                    <td className="px-3 py-2.5 text-rs-muted">{pct(row.count, filtered.length)}%</td>
                    <td className="px-3 py-2.5"><ResolutionBar resolved={row.resolved} total={row.count} /></td>
                    <td className="px-3 py-2.5 text-rs-text">{row.resolved} / {row.count}</td>
                    <td className="px-3 py-2.5 text-rs-text">{row.open}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-rs-border bg-rs-surface font-semibold">
                  <td className="px-3 py-2 text-rs-text">TOTAL</td>
                  <td className="px-3 py-2 text-rs-text">{cats.substantive.length}</td>
                  <td className="px-3 py-2 text-rs-muted">{pct(cats.substantive.length, filtered.length)}%</td>
                  <td className="px-3 py-2"><ResolutionBar resolved={cats.substantive.filter(isResolved).length} total={cats.substantive.length} /></td>
                  <td className="px-3 py-2 text-rs-text">{cats.substantive.filter(isResolved).length} / {cats.substantive.length}</td>
                  <td className="px-3 py-2 text-rs-text">{outstanding.substantive.openCount}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Drill Panel ─────────────────────────────────────── */}
      {drill && (
        <TicketDrillPanel
          tickets={drill.tickets}
          title={drill.title}
          jiraIssues={jiraIssues}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}
