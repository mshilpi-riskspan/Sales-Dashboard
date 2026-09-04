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

const DEFAULT_STATUS_LABELS = {
  2: 'Open', 3: 'Pending', 4: 'Resolved', 5: 'Closed',
  6: 'Working on Query', 7: 'Waiting on Customer', 10: 'Pending LVL3/EDGE',
};

const RANGE_OPTS = [
  { key: 'month',  label: 'This Month' },
  { key: '3month', label: '3M' },
  { key: '6month', label: '6M' },
  { key: '1year',  label: '1Y' },
];

const CAT_COLORS = { l3edge: '#8B5CF6', admin: '#FFA91D', substantive: '#0C8EA3' };
const CAT_LABELS  = { l3edge: 'L3 + Edge', admin: 'Admin / Overhead', substantive: 'Non-Escalated' };

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

function outstandingStats(tickets, statusLabels) {
  const open = tickets.filter(isOpen);
  const byStatus = {};
  for (const t of open) {
    const label = statusLabels[t.status] || `Status ${t.status}`;
    byStatus[label] = (byStatus[label] || 0) + 1;
  }
  return {
    total: tickets.length,
    openCount: open.length,
    openPct: pct(open.length, tickets.length),
    byStatus: Object.entries(byStatus).sort((a, b) => b[1] - a[1]),
  };
}

function avgHours(deltas) {
  if (!deltas.length) return null;
  const h = deltas.reduce((a, b) => a + b, 0) / deltas.length / 36e5;
  return Math.round(h * 10) / 10;
}

function medianHours(deltas) {
  if (!deltas.length) return null;
  const sorted = [...deltas].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const h = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
  return Math.round(h / 36e5 * 10) / 10;
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

  const [range, setRange]             = useState('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd,   setCustomEnd]   = useState('');
  const [drill, setDrill]             = useState(null);
  const [l3Sort,    setL3Sort]    = useState({ key: 'total', dir: 'desc' });
  const [subSort,   setSubSort]   = useState({ key: 'count', dir: 'desc' });
  const [adminSort, setAdminSort] = useState({ key: 'count', dir: 'desc' });
  const [crossSort, setCrossSort] = useState({ key: 'total', dir: 'desc' });

  const tickets  = fdQ.data?.tickets   ?? [];
  const jiraIssues = jiraQ.data?.issues ?? [];

  const FD_STATUS_LABELS = useMemo(
    () => fdQ.data?.statusLabels ?? DEFAULT_STATUS_LABELS,
    [fdQ.data]
  );

  const companiesById = useMemo(() => {
    const map = new Map();
    for (const c of fdQ.data?.companies ?? []) map.set(c.id, c.name);
    return map;
  }, [fdQ.data?.companies]);

  const jiraByKey = useMemo(() => {
    const map = new Map();
    for (const issue of jiraIssues) if (issue.key) map.set(issue.key, issue);
    return map;
  }, [jiraIssues]);

  // Calendar-based date filter
  const filtered = useMemo(() => {
    if (range === 'custom') {
      const start = customStart ? new Date(customStart) : null;
      const end   = customEnd   ? new Date(customEnd + 'T23:59:59') : null;
      return tickets.filter((t) => {
        if (!t.created_at) return false;
        const d = new Date(t.created_at);
        if (start && d < start) return false;
        if (end   && d > end)   return false;
        return true;
      });
    }
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    let cutoff;
    if (range === 'month')       cutoff = new Date(y, m, 1);
    else if (range === '3month') cutoff = new Date(y, m - 3, 1);
    else if (range === '6month') cutoff = new Date(y, m - 6, 1);
    else                         cutoff = new Date(y, m - 12, 1);
    return tickets.filter((t) => t.created_at && new Date(t.created_at) >= cutoff);
  }, [tickets, range, customStart, customEnd]);

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
      total:            filtered.length,
      openCount:        filtered.filter(isOpen).length,
      l3edgeCount:      cats.l3edge.length,
      l3edgePct:        pct(cats.l3edge.length, filtered.length),
      l3edgeResPct:     pct(l3edgeResolved, cats.l3edge.length),
      l3edgeResolved,
      l3edgeOpen,
      adminCount:       cats.admin.length,
      adminPct:         pct(cats.admin.length, filtered.length),
      substantiveCount: cats.substantive.length,
      substantivePct:   pct(cats.substantive.length, filtered.length),
    };
  }, [filtered, cats]);

  // Time metrics
  const timeMetrics = useMemo(() => {
    const firstRespDeltas = filtered
      .filter((t) => t.stats?.first_responded_at && t.created_at)
      .map((t) => new Date(t.stats.first_responded_at) - new Date(t.created_at))
      .filter((ms) => ms > 0);

    const resolvedDeltas = filtered
      .filter((t) => t.stats?.resolved_at && t.created_at && isResolved(t))
      .map((t) => new Date(t.stats.resolved_at) - new Date(t.created_at))
      .filter((ms) => ms > 0);

    const escalationDeltas = [];
    for (const t of cats.l3edge) {
      const tags = t.tags || [];
      for (const tag of tags) {
        if (tag.startsWith('LVL3-') || tag.startsWith('EDGE-')) {
          const issue = jiraByKey.get(tag);
          if (issue?.created && t.created_at) {
            const ms = new Date(issue.created) - new Date(t.created_at);
            if (ms > 0) escalationDeltas.push(ms);
          }
          break;
        }
      }
    }

    return {
      avgFirstResponse: medianHours(firstRespDeltas),
      avgEscalation:    medianHours(escalationDeltas),
      avgResolution:    medianHours(resolvedDeltas),
    };
  }, [filtered, cats.l3edge, jiraByKey]);

  // Donut data
  const pieData = useMemo(() => [
    { key: 'substantive', name: 'Non-Escalated',   value: cats.substantive.length, color: CAT_COLORS.substantive },
    { key: 'admin',       name: 'Admin / Overhead', value: cats.admin.length,       color: CAT_COLORS.admin },
    { key: 'l3edge',      name: 'L3 + Edge',        value: cats.l3edge.length,      color: CAT_COLORS.l3edge },
  ].filter((d) => d.value > 0), [cats]);

  // Admin by type (with resolved + open tracking)
  const adminByType = useMemo(() => {
    const map = new Map();
    for (const t of cats.admin) {
      const type = t.type || 'Other';
      if (!map.has(type)) map.set(type, { type, count: 0, resolved: 0, open: 0 });
      const e = map.get(type);
      e.count++;
      isResolved(t) ? e.resolved++ : e.open++;
    }
    return [...map.values()];
  }, [cats.admin]);

  // L3/Edge by type
  const l3edgeByType = useMemo(() => {
    const map = new Map();
    for (const t of cats.l3edge) {
      const type   = t.type || 'Other';
      const isEdge = (t.tags || []).some((tag) => tag.startsWith('EDGE-'));
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

  // Cross-category by type
  const crossByType = useMemo(() => {
    const map = new Map();
    function add(ticket, cat) {
      const type = ticket.type || 'Other';
      if (!map.has(type)) map.set(type, { type, total: 0, l3edge: 0, substantive: 0, admin: 0 });
      const e = map.get(type);
      e.total++;
      e[cat]++;
    }
    for (const t of cats.l3edge)      add(t, 'l3edge');
    for (const t of cats.substantive) add(t, 'substantive');
    for (const t of cats.admin)       add(t, 'admin');
    return [...map.values()];
  }, [cats]);

  // Outstanding stats per category
  const outstanding = useMemo(() => ({
    l3edge:      outstandingStats(cats.l3edge, FD_STATUS_LABELS),
    admin:       outstandingStats(cats.admin, FD_STATUS_LABELS),
    substantive: outstandingStats(cats.substantive, FD_STATUS_LABELS),
  }), [cats, FD_STATUS_LABELS]);

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
  function toggleAdminSort(key) {
    setAdminSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  }
  function toggleCrossSort(key) {
    setCrossSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  }

  const sortedL3    = useMemo(() => sortRows(l3edgeByType,     l3Sort.key,    l3Sort.dir),    [l3edgeByType,     l3Sort]);
  const sortedSub   = useMemo(() => sortRows(substantiveByType, subSort.key,   subSort.dir),   [substantiveByType, subSort]);
  const sortedAdmin = useMemo(() => sortRows(adminByType,       adminSort.key, adminSort.dir), [adminByType,       adminSort]);
  const sortedCross = useMemo(() => sortRows(crossByType,       crossSort.key, crossSort.dir), [crossByType,       crossSort]);

  const rangeLabel = range === 'custom'
    ? (customStart || customEnd ? `${customStart || '…'} – ${customEnd || '…'}` : 'Custom range')
    : (RANGE_OPTS.find((o) => o.key === range)?.label ?? 'This Month');

  if (fdQ.loading) {
    return <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>;
  }
  if (fdQ.error) {
    return <ErrorState message={fdQ.error} onRetry={triggerRefresh} />;
  }

  const fmtHours = (h) => h != null ? `${h}h` : '—';
  const failures = fdQ.data?.failures ?? [];

  return (
    <div>
      {failures.length > 0 && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
          Freshdesk data partially failed — could not load: {failures.join(', ')}. Check Cloudflare Pages function logs.
        </div>
      )}
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-rs-text">Support Tickets</h2>
          <p className="text-xs text-rs-muted mt-0.5">{filtered.length} tickets · Freshdesk</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-1 bg-rs-surface rounded-lg p-1">
            {RANGE_OPTS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setRange(opt.key)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  range === opt.key
                    ? 'bg-white text-rs-teal shadow-sm border border-rs-border'
                    : 'text-rs-muted hover:text-rs-text'
                }`}
              >
                {opt.label}
              </button>
            ))}
            <button
              onClick={() => setRange('custom')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                range === 'custom'
                  ? 'bg-white text-rs-teal shadow-sm border border-rs-border'
                  : 'text-rs-muted hover:text-rs-text'
              }`}
            >
              Custom
            </button>
          </div>
          {range === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="text-xs border border-rs-border rounded-md px-2 py-1 text-rs-text bg-white focus:outline-none focus:ring-1 focus:ring-rs-teal"
              />
              <span className="text-xs text-rs-muted">–</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="text-xs border border-rs-border rounded-md px-2 py-1 text-rs-text bg-white focus:outline-none focus:ring-1 focus:ring-rs-teal"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── KPI Row 1: Counts ──────────────────────────────── */}
      <div className="grid grid-cols-5 gap-4 mb-3">
        <KpiCard
          title="Total Tickets"
          value={kpis.total}
          subtitle={rangeLabel}
          onClick={() => setDrill({ tickets: filtered, title: 'All Tickets' })}
        />
        <KpiCard
          title="Open Tickets"
          value={kpis.openCount}
          subtitle={`${pct(kpis.openCount, kpis.total)}% unresolved`}
          onClick={() => setDrill({ tickets: filtered.filter(isOpen), title: 'Open Tickets' })}
        />
        <KpiCard
          title="Admin / Overhead"
          value={kpis.adminCount}
          subtitle={`${kpis.adminPct}% of total`}
          onClick={() => setDrill({ tickets: cats.admin, title: 'Admin / Overhead Tickets' })}
        />
        <KpiCard
          title="Non-Escalated"
          value={kpis.substantiveCount}
          subtitle={`${kpis.substantivePct}% of total`}
          onClick={() => setDrill({ tickets: cats.substantive, title: 'Non-Escalated Tickets' })}
        />
        <KpiCard
          title="L3 + Edge"
          value={kpis.l3edgeCount}
          subtitle={`${kpis.l3edgePct}% of total`}
          onClick={() => setDrill({ tickets: cats.l3edge, title: 'L3 + Edge Tickets' })}
        />
      </div>

      {/* ── KPI Row 2: Time Metrics ─────────────────────────── */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <KpiCard
          title="Median First Response"
          value={fmtHours(timeMetrics.avgFirstResponse)}
          subtitle="from ticket creation"
        />
        <KpiCard
          title="Median Time to Escalation"
          value={fmtHours(timeMetrics.avgEscalation)}
          subtitle="creation to Jira issue"
        />
        <KpiCard
          title="Median Time to Resolution"
          value={fmtHours(timeMetrics.avgResolution)}
          subtitle="creation to resolved"
        />
      </div>

      {/* ── Row 1: Donut | L3/Edge Detail ──────────────────── */}
      <div className="grid grid-cols-2 gap-4 mb-4">

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
                  title="Click to drill down"
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
                      title="Click to drill down"
                      className="flex items-center justify-center text-[9px] font-bold text-white bg-purple-500 hover:bg-purple-600 transition-colors"
                      style={{ width: `${pct(cats.l3.length, kpis.l3edgeCount)}%` }}
                    >
                      LVL3 · {cats.l3.length}
                    </button>
                  )}
                  {cats.edge.length > 0 && (
                    <button
                      onClick={() => setDrill({ tickets: cats.edge, title: 'Edge Tickets' })}
                      title="Click to drill down"
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
                      title="Click to drill down"
                      className="flex items-center justify-center text-[9px] font-bold text-white bg-green-500 hover:bg-green-600 transition-colors"
                      style={{ width: `${kpis.l3edgeResPct}%` }}
                    >
                      {kpis.l3edgeResPct > 15 && `Resolved · ${kpis.l3edgeResolved}`}
                    </button>
                  )}
                  {kpis.l3edgeOpen > 0 && (
                    <button
                      onClick={() => setDrill({ tickets: cats.l3edge.filter(isOpen), title: 'L3 / Edge — Open' })}
                      title="Click to drill down"
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

      {/* ── Row 2: Open Tickets — Outstanding by Category ──── */}
      <div className="rounded-xl border border-rs-border bg-white overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-rs-border">
          <h3 className="text-xs font-semibold text-rs-text uppercase tracking-wide">
            Open Tickets — Outstanding by Category · {rangeLabel}
          </h3>
        </div>
        <div className="grid grid-cols-3 divide-x divide-rs-border">
          {[
            { key: 'l3edge',      label: 'L3 & Edge',         tickets: cats.l3edge,      color: CAT_COLORS.l3edge      },
            { key: 'admin',       label: 'Admin / Overhead',   tickets: cats.admin,        color: CAT_COLORS.admin       },
            { key: 'substantive', label: 'Non-Escalated',      tickets: cats.substantive,  color: CAT_COLORS.substantive },
          ].map(({ key, label, tickets: catTickets, color }) => {
            const stats = outstanding[key];
            return (
              <div key={key} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-rs-text">{label}</p>
                  <p className="text-xs text-rs-muted">{stats.openCount} open / {stats.total} total</p>
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
                      title="Click to drill down"
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

      {/* ── L3/Edge by Type table ───────────────────────────── */}
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
                    title="Click to drill down"
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

      {/* ── Non-Escalated by Type table ─────────────────────── */}
      {substantiveByType.length > 0 && (
        <div className="rounded-xl border border-rs-border bg-white overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-rs-border">
            <h3 className="text-xs font-semibold text-rs-text uppercase tracking-wide">
              Non-Escalated Ticket Types
              <span className="ml-2 font-normal text-rs-muted normal-case">— {cats.substantive.length} tickets (admin & escalations excluded)</span>
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '38%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '24%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '8%' }} />
              </colgroup>
              <thead>
                <tr className="bg-rs-teal">
                  <SortTh label="Ticket Type"   sortKey="type"     active={subSort.key === 'type'}     dir={subSort.dir} onSort={toggleSubSort} />
                  <SortTh label="Count"         sortKey="count"    active={subSort.key === 'count'}    dir={subSort.dir} onSort={toggleSubSort} />
                  <StaticTh label="% Share" />
                  <StaticTh label="Resolution Rate" />
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
                      title: `Non-Escalated: ${row.type}`,
                    })}
                    title="Click to drill down"
                    className="border-b border-rs-border hover:bg-rs-surface cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2.5 font-medium text-rs-text">{row.type}</td>
                    <td className="px-3 py-2.5 text-rs-text">{row.count}</td>
                    <td className="px-3 py-2.5 text-rs-muted">{pct(row.count, cats.substantive.length)}%</td>
                    <td className="px-3 py-2.5"><ResolutionBar resolved={row.resolved} total={row.count} /></td>
                    <td className="px-3 py-2.5 text-rs-text">{row.resolved} / {row.count}</td>
                    <td className="px-3 py-2.5 text-rs-text">{row.open}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-rs-border bg-rs-surface font-semibold">
                  <td className="px-3 py-2 text-rs-text">TOTAL</td>
                  <td className="px-3 py-2 text-rs-text">{cats.substantive.length}</td>
                  <td className="px-3 py-2 text-rs-muted">100%</td>
                  <td className="px-3 py-2"><ResolutionBar resolved={cats.substantive.filter(isResolved).length} total={cats.substantive.length} /></td>
                  <td className="px-3 py-2 text-rs-text">{cats.substantive.filter(isResolved).length} / {cats.substantive.length}</td>
                  <td className="px-3 py-2 text-rs-text">{outstanding.substantive.openCount}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Admin by Type table ─────────────────────────────── */}
      {adminByType.length > 0 && (
        <div className="rounded-xl border border-rs-border bg-white overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-rs-border">
            <h3 className="text-xs font-semibold text-rs-text uppercase tracking-wide">
              Admin / Overhead Ticket Types
              <span className="ml-2 font-normal text-rs-muted normal-case">— {kpis.adminCount} tickets</span>
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '38%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '24%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '8%' }} />
              </colgroup>
              <thead>
                <tr className="bg-rs-teal">
                  <SortTh label="Ticket Type"   sortKey="type"     active={adminSort.key === 'type'}     dir={adminSort.dir} onSort={toggleAdminSort} />
                  <SortTh label="Count"         sortKey="count"    active={adminSort.key === 'count'}    dir={adminSort.dir} onSort={toggleAdminSort} />
                  <StaticTh label="% Share" />
                  <StaticTh label="Resolution Rate" />
                  <SortTh label="Resolved"      sortKey="resolved" active={adminSort.key === 'resolved'} dir={adminSort.dir} onSort={toggleAdminSort} />
                  <SortTh label="Open"          sortKey="open"     active={adminSort.key === 'open'}     dir={adminSort.dir} onSort={toggleAdminSort} />
                </tr>
              </thead>
              <tbody>
                {sortedAdmin.map((row) => (
                  <tr
                    key={row.type}
                    onClick={() => setDrill({
                      tickets: cats.admin.filter((t) => (t.type || 'Other') === row.type),
                      title: `Admin: ${row.type}`,
                    })}
                    title="Click to drill down"
                    className="border-b border-rs-border hover:bg-rs-surface cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2.5 font-medium text-rs-text">{row.type}</td>
                    <td className="px-3 py-2.5 text-rs-text">{row.count}</td>
                    <td className="px-3 py-2.5 text-rs-muted">{pct(row.count, kpis.adminCount)}%</td>
                    <td className="px-3 py-2.5"><ResolutionBar resolved={row.resolved} total={row.count} /></td>
                    <td className="px-3 py-2.5 text-rs-text">{row.resolved} / {row.count}</td>
                    <td className="px-3 py-2.5 text-rs-text">{row.open}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-rs-border bg-rs-surface font-semibold">
                  <td className="px-3 py-2 text-rs-text">TOTAL</td>
                  <td className="px-3 py-2 text-rs-text">{kpis.adminCount}</td>
                  <td className="px-3 py-2 text-rs-muted">100%</td>
                  <td className="px-3 py-2"><ResolutionBar resolved={cats.admin.filter(isResolved).length} total={kpis.adminCount} /></td>
                  <td className="px-3 py-2 text-rs-text">{cats.admin.filter(isResolved).length} / {kpis.adminCount}</td>
                  <td className="px-3 py-2 text-rs-text">{outstanding.admin.openCount}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Cross-Category by Type ─────────────────────────── */}
      {crossByType.length > 0 && (
        <div className="rounded-xl border border-rs-border bg-white overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-rs-border">
            <h3 className="text-xs font-semibold text-rs-text uppercase tracking-wide">
              All Types — Cross-Category
              <span className="ml-2 font-normal text-rs-muted normal-case">— one row per type across L3+Edge, Non-Escalated, and Admin</span>
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-rs-teal">
                  <SortTh label="Ticket Type"   sortKey="type"        active={crossSort.key === 'type'}        dir={crossSort.dir} onSort={toggleCrossSort} />
                  <SortTh label="Total"         sortKey="total"       active={crossSort.key === 'total'}       dir={crossSort.dir} onSort={toggleCrossSort} />
                  <SortTh label="L3 + Edge"     sortKey="l3edge"      active={crossSort.key === 'l3edge'}      dir={crossSort.dir} onSort={toggleCrossSort} />
                  <SortTh label="Non-Escalated" sortKey="substantive" active={crossSort.key === 'substantive'} dir={crossSort.dir} onSort={toggleCrossSort} />
                  <SortTh label="Admin"         sortKey="admin"       active={crossSort.key === 'admin'}       dir={crossSort.dir} onSort={toggleCrossSort} />
                </tr>
              </thead>
              <tbody>
                {sortedCross.map((row) => (
                  <tr
                    key={row.type}
                    onClick={() => setDrill({
                      tickets: filtered.filter((t) => (t.type || 'Other') === row.type),
                      title: `Type: ${row.type}`,
                    })}
                    title="Click to drill down"
                    className="border-b border-rs-border hover:bg-rs-surface cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2.5 font-medium text-rs-text">{row.type}</td>
                    <td className="px-3 py-2.5 text-rs-text font-medium">{row.total}</td>
                    <td className="px-3 py-2.5 text-rs-text">
                      {row.l3edge > 0 ? row.l3edge : <span className="text-rs-muted">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-rs-text">
                      {row.substantive > 0 ? row.substantive : <span className="text-rs-muted">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-rs-text">
                      {row.admin > 0 ? row.admin : <span className="text-rs-muted">—</span>}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-rs-border bg-rs-surface font-semibold">
                  <td className="px-3 py-2 text-rs-text">TOTAL</td>
                  <td className="px-3 py-2 text-rs-text">{filtered.length}</td>
                  <td className="px-3 py-2 text-rs-text">{kpis.l3edgeCount}</td>
                  <td className="px-3 py-2 text-rs-text">{kpis.substantiveCount}</td>
                  <td className="px-3 py-2 text-rs-text">{kpis.adminCount}</td>
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
          companiesById={companiesById}
          statusLabels={FD_STATUS_LABELS}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}
