import { useState, useEffect, useMemo, Fragment } from 'react';
import { format } from 'date-fns';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend,
} from 'recharts';
import {
  ArrowLeftIcon, MapPinIcon, GlobeAltIcon,
} from '@heroicons/react/24/outline';
import {
  fetchAccountDetail, fetchAccountContacts,
  fetchAccountActivities, fetchAccountOpportunities,
} from '../../datasources/salesforce';
import { fetchAccountUsage, fetchSnowflakeClients, fetchAccountUsers, fetchUserActivity } from '../../datasources/snowflake';
import { fetchFreshdeskData } from '../../datasources/freshdesk';
import { fetchJiraData } from '../../datasources/jira';
import { fetchAstronomerData } from '../../datasources/astronomer';
import { fetchMaxioData } from '../../datasources/maxio';
import { matchFreshdeskTickets, matchJiraIssues, matchAstroDags, buildMaxioBilling, buildMaxioArrSeries, knownTagsForAccount } from '../../lib/externalDataMatch';
import { findConfirmedClientId } from '../../lib/accountMapping';
import DealDetailPanel from '../../components/common/DealDetailPanel';
import PipelineListPanel from '../pipeline/PipelineListPanel';
import { isClientTier } from '../../config/accountTier';
import StatTile from './StatTile';
import SimpleTablePanel from './SimpleTablePanel';
import UsageCategoryPanel from './UsageCategoryPanel';
import ContactListPanel from './ContactListPanel';
import ActivityListPanel from './ActivityListPanel';
import { TicketListPanel, TicketDetailPanel } from './TicketPanels';
import { JiraListPanel, JiraDetailPanel } from './JiraPanels';
import { BatchListPanel, BatchDetailPanel } from './BatchPanels';
import UsageChart, { METRICS } from './UsageChart';
import MaxioArrChart from './MaxioArrChart';

// L3 = Jira project key LVL3 (issue keys like LVL3-1234) — same convention
// client-health uses to identify escalated support issues, ported here
// since we already fetch the same unscoped Jira issue set.
function isL3Issue(issue) {
  return (issue.fields?.project?.key || '').toUpperCase() === 'LVL3';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatARR(v) {
  if (!v) return '—';
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function formatNum(v) {
  if (v === null || v === undefined) return '—';
  return Math.round(v).toLocaleString();
}

function formatMoney(v) {
  if (v === null || v === undefined) return '—';
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${Math.round(v)}`;
}

// Exact (unrounded/unabbreviated) dollar figure — used for Maxio billing
// specifically, since "$2.0M" for an actual $1,950,492 ARR (formatMoney's
// 1-decimal-place M rounding) reads as materially wrong at this level of
// precision.
function formatMoneyExact(v) {
  if (v === null || v === undefined) return '—';
  return `$${Math.round(v).toLocaleString()}`;
}

function formatSignedNum(v) {
  if (v === null || v === undefined) return '';
  const rounded = Math.round(v * 10) / 10;
  return `${rounded >= 0 ? '+' : ''}${rounded.toLocaleString()}`;
}

function formatSignedMoney(v) {
  if (v === null || v === undefined) return '';
  return `${v >= 0 ? '+' : '-'}${formatMoney(Math.abs(v))}`;
}

function relativeDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00' : dateStr);
  const diff = Math.floor((Date.now() - d) / 86400000);
  if (diff < 0) return 'Upcoming';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 30) return `${diff}d ago`;
  if (diff < 365) return `${Math.floor(diff / 30)}mo ago`;
  return `${Math.floor(diff / 365)}yr ago`;
}

function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-rs-surface rounded ${className}`} />;
}

function SectionLabel({ children }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-rs-muted mb-3">
      {children}
    </p>
  );
}

const HEALTH_STYLES = {
  GREEN: 'bg-green-100 text-green-700',
  YELLOW: 'bg-amber-100 text-amber-700',
  RED: 'bg-red-100 text-red-600',
};

// Column defs for the DaaS/RaaS SimpleTablePanel — same rendering as the
// markup that used to be always-inline.
const DAAS_COLUMNS = [
  { key: 'MODULE', label: 'Module' },
  { key: 'DATASET_NAME', label: 'Dataset' },
  {
    key: 'LOAN_COUNT', label: 'Loans',
    render: (d) => (<>{formatNum(d.LOAN_COUNT)}{d.LOAN_COUNT_DELTA ? <span className="text-rs-muted ml-1">({formatSignedNum(d.LOAN_COUNT_DELTA)})</span> : null}</>),
  },
  {
    key: 'TOTAL_UPB', label: 'Total UPB',
    render: (d) => (<>{formatMoney(d.TOTAL_UPB)}{d.UPB_DELTA ? <span className="text-rs-muted ml-1">({formatSignedMoney(d.UPB_DELTA)})</span> : null}</>),
  },
  {
    key: 'DQ_PCT', label: 'DQ %',
    render: (d) => (<>{d.DQ_PCT != null ? `${d.DQ_PCT.toFixed(1)}%` : '—'}{d.DQ_PCT_DELTA ? <span className="ml-1">({formatSignedNum(d.DQ_PCT_DELTA)}pp)</span> : null}</>),
  },
  { key: 'LATEST_DATE', label: 'Latest Date' },
  {
    key: 'STATUS', label: 'Status',
    render: (d) => d.ERROR
      ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-600" title={d.ERROR}>Error</span>
      : d.HAS_DATA
        ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-700">Fresh</span>
        : <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">No Data</span>,
  },
];

// Column defs for the Maxio contract-lines SimpleTablePanel — every
// transaction (active/expired/cancelled), so the full renewal history is
// visible, not just what's active right now.
const MAXIO_COLUMNS = [
  { key: 'itemName', label: 'Module / Item', render: (t) => t.itemName || '—' },
  { key: 'start_date', label: 'Start Date', render: (t) => t.start_date || '—' },
  { key: 'end_date', label: 'Renewal Date', render: (t) => t.end_date || '—' },
  { key: 'home_arr_amount', label: 'ARR', render: (t) => formatMoneyExact(Number(t.home_arr_amount) || 0) },
  { key: 'home_amount', label: 'Line Value', render: (t) => formatMoneyExact(Number(t.home_amount) || 0) },
  {
    key: 'status', label: 'Status',
    render: (t) => t.cancelled
      ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-600">Cancelled</span>
      : t.isActive
        ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-700">Active</span>
        : <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">Expired</span>,
  },
  { key: 'is_autorenewal', label: 'Auto-Renew', render: (t) => (t.is_autorenewal ? 'Yes' : 'No') },
  { key: 'invoice_description', label: 'Description', render: (t) => t.invoice_description || '—' },
];

// Copy of cadence logic from DealDetailPanel (per plan: copy, don't refactor shared component)
function computeCadence(activities) {
  const { tasks = [], events = [] } = activities || {};
  const all = [
    ...tasks.map(t => t.ActivityDate),
    ...events.map(e => e.StartDateTime?.slice(0, 10)),
  ].filter(Boolean);
  const now = Date.now();
  const count = (days) => all.filter(d => (now - new Date(d + 'T00:00:00')) / 86400000 <= days).length;
  return { last7: count(7), last90: count(90), last365: count(365) };
}

function CadenceBar({ label, count, total }) {
  const pct = total > 0 ? Math.min((count / total) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-rs-muted w-14 shrink-0 text-right">{label}</span>
      <div className="flex-1 h-1.5 bg-rs-surface rounded-full overflow-hidden">
        <div className="h-full bg-rs-teal rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-rs-text w-5 text-right">{count}</span>
    </div>
  );
}

// ── Usage helpers (ported from UsageCategoryPanel) ───────────────────────────

const FD_STATUS_LABELS = { 2: 'Open', 3: 'Pending', 4: 'Resolved', 5: 'Closed' };
const FD_STATUS_COLORS = {
  2: 'bg-blue-100 text-blue-700',
  3: 'bg-amber-100 text-amber-700',
  4: 'bg-green-100 text-green-700',
  5: 'bg-slate-100 text-slate-600',
};

function dagStateBadgeCls(state) {
  if (!state) return 'bg-slate-100 text-slate-600';
  if (state === 'success') return 'bg-green-100 text-green-700';
  if (state === 'failed' || state === 'failed') return 'bg-red-100 text-red-600';
  if (state === 'running') return 'bg-blue-100 text-blue-700';
  return 'bg-slate-100 text-slate-600';
}

function lastRunOf(dag) {
  return [...(dag.runs || [])].sort((a, b) => new Date(b.start_date) - new Date(a.start_date))[0];
}

const USER_RANGES = [
  { key: '7',   label: '1W' },
  { key: '30',  label: '1M' },
  { key: '90',  label: '3M' },
  { key: '365', label: '1Y' },
];

const USER_TYPE_FILTERS = [
  { key: 'all',          label: 'All' },
  { key: 'System/Batch', label: 'System/Batch' },
  { key: 'End User',     label: 'Users' },
];

function flattenTypeCounts(...objs) {
  const out = new Map();
  for (const obj of objs) {
    for (const [key, count] of Object.entries(obj || {})) {
      const label = key.split(';').find((part) => !/^EdgeScenario=/i.test(part)) || key;
      out.set(label, (out.get(label) || 0) + count);
    }
  }
  return [...out.entries()].sort((a, b) => b[1] - a[1]);
}

function TypePills({ counts }) {
  const flat = flattenTypeCounts(counts);
  if (flat.length === 0) return <span className="text-rs-muted">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {flat.map(([label, count]) => (
        <span key={label} className="text-[10px] bg-rs-surface border border-rs-border/50 rounded-full px-1.5 py-0.5 text-rs-muted whitespace-nowrap">
          {label} <span className="font-medium text-rs-text">{Math.round(count).toLocaleString()}</span>
        </span>
      ))}
    </div>
  );
}

function RunActivityChart({ activity, height = 160, showLegend = true }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={activity} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <XAxis dataKey="RUN_DATE" tick={{ fontSize: 10, fill: '#858C9C' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: '#858C9C' }} axisLine={false} tickLine={false} width={32} />
        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #DADEE5' }} />
        {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />}
        <Line type="monotone" dataKey="FORECAST_RUN_COUNT" name="Forecast runs" stroke="#D97706" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="QUERY_RUN_COUNT" name="Query runs" stroke="#0C8EA3" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function UserActivityRow({ userId, accountId, clientId, daysBack }) {
  const [activity, setActivity] = useState(null);
  useEffect(() => {
    setActivity(null);
    fetchUserActivity({ accountId, clientId, userIds: [userId], daysBack })
      .then((data) => setActivity(data.activity || []))
      .catch(() => setActivity([]));
  }, [userId, accountId, clientId, daysBack]);

  return (
    <tr className="bg-rs-surface/40">
      <td colSpan={10} className="px-3 py-3">
        {activity === null ? (
          <p className="text-xs text-rs-muted">Loading activity…</p>
        ) : activity.length === 0 ? (
          <p className="text-xs text-rs-muted">No run activity in this range.</p>
        ) : (
          <RunActivityChart activity={activity} height={120} showLegend={false} />
        )}
      </td>
    </tr>
  );
}

function aggregateMetric(rows, metric) {
  let sum = 0, count = 0;
  for (const row of rows) {
    const v = row[metric.key];
    if (v === null || v === undefined) continue;
    sum += v; count += 1;
  }
  if (count === 0) return null;
  return metric.agg === 'avg' ? Math.round((sum / count) * 100) / 100 : sum;
}

function formatMetricValue(metric, value) {
  if (value == null) return '—';
  if (metric.key === 'AVG_API_LATENCY_MS') return `${Math.round(value)}ms`;
  return Math.round(value).toLocaleString();
}

function SectionCard({ title, badge, onViewAll, loading, children }) {
  return (
    <div className="rounded-card border border-rs-border bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-rs-border bg-rs-surface">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-rs-text uppercase tracking-wide">{title}</h3>
          {badge && <span className="text-[10px] bg-rs-teal/10 text-rs-teal px-2 py-0.5 rounded-full">{badge}</span>}
        </div>
        {onViewAll && <button onClick={onViewAll} className="text-xs text-rs-teal hover:underline">View all →</button>}
      </div>
      {loading ? (
        <div className="p-4 space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-8 bg-rs-surface rounded animate-pulse" />)}
        </div>
      ) : children}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AccountView({ accountId, onBack }) {
  const [account, setAccount] = useState(null);
  const [contacts, setContacts] = useState(null);
  const [activities, setActivities] = useState(null);
  const [opps, setOpps] = useState(null);
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [externalData, setExternalData] = useState({ tickets: [], issues: [], dags: [] });
  const [externalDataLoading, setExternalDataLoading] = useState(true);
  const [maxioBilling, setMaxioBilling] = useState({ arr: 0, nextRenewalDate: null, lines: [] });

  // Drill-down state — `openPanel` drives whichever LIST-level panel is
  // open (mutually exclusive by construction, matching SlidePanel's own
  // one-at-a-time design); the four `active*` vars hold a single record
  // drilled into from a list, one level deeper.
  const [openPanel, setOpenPanel] = useState(null); // { type: 'deals'|'contacts'|'activity'|'datasets'|'tickets'|'issues'|'l3'|'liveDags'|'maxio' }
  const [activeDeal, setActiveDeal] = useState(null);

  // Usage panel state (lifted from UsageCategoryPanel, now inline on the page)
  const [chartWindow, setChartWindow] = useState({ dailyRows: [], daysBack: 180, lookbackLabel: '6mo', loading: true });
  const [usersDaysBack, setUsersDaysBack] = useState('30');
  const [userTypeFilter, setUserTypeFilter] = useState('all');
  const [selectedUserIds, setSelectedUserIds] = useState(() => new Set());
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [chartActivity, setChartActivity] = useState([]);
  const [chartActivityLoading, setChartActivityLoading] = useState(false);
  const [activeTicket, setActiveTicket] = useState(null);
  const [activeIssue, setActiveIssue] = useState(null);
  const [activeL3Issue, setActiveL3Issue] = useState(null);
  const [activeDag, setActiveDag] = useState(null);

  useEffect(() => {
    setLoading(true);
    setAccount(null);
    setContacts(null);
    setActivities(null);
    setOpps(null);
    Promise.all([
      fetchAccountDetail(accountId),
      fetchAccountContacts(accountId),
      fetchAccountActivities(accountId),
      fetchAccountOpportunities(accountId),
    ]).then(([acct, ctcts, acts, oppsData]) => {
      setAccount(acct);
      setContacts(ctcts);
      setActivities(acts);
      setOpps(oppsData);
      setLoading(false);
    });
  }, [accountId]);

  // Independent of the Salesforce fetch above — a Snowflake hiccup should
  // never block the rest of the page from rendering.
  useEffect(() => {
    setUsageLoading(true);
    setUsage(null);
    const clientId = findConfirmedClientId(accountId);
    fetchAccountUsage(clientId ? { clientId } : { accountId })
      .then(setUsage)
      .catch(() => setUsage({ clientId: null, mapped: false, failures: [] }))
      .finally(() => setUsageLoading(false));
  }, [accountId]);

  // Independent of both fetches above — reuses the same bulk Freshdesk/Jira/
  // Astronomer/Maxio fetches the Current Clients page uses (5-min cached, so
  // this isn't a new per-account network cost) and filters to just this
  // account. allSettled, not all — e.g. Maxio env vars missing in one
  // environment must not blank out Freshdesk/Jira/Astronomer too, each
  // source degrades independently.
  useEffect(() => {
    setExternalDataLoading(true);
    setExternalData({ tickets: [], issues: [], dags: [] });
    Promise.allSettled([
      fetchSnowflakeClients(),
      fetchFreshdeskData(),
      fetchJiraData(),
      fetchAstronomerData(),
      fetchMaxioData(),
    ]).then(([snowflakeClientsR, freshdeskDataR, jiraDataR, astroDataR, maxioDataR]) => {
      const value = (r, fallback) => (r.status === 'fulfilled' ? r.value : fallback);
      const snowflakeClients = value(snowflakeClientsR, []);
      const freshdeskData = value(freshdeskDataR, { tickets: [], companies: [] });
      const jiraData = value(jiraDataR, { issues: [] });
      const astroData = value(astroDataR, { dags: [], runsByDagId: {} });
      const maxioData = value(maxioDataR, { customers: [], contracts: [], transactions: [], items: [] });

      const overrideClientId = findConfirmedClientId(accountId);
      const directClient = snowflakeClients.find((c) => c.salesforceAccountId === accountId);
      const clientId = overrideClientId || directClient?.clientId || null;
      const clientRecord = clientId ? snowflakeClients.find((c) => c.clientId === clientId) : null;
      const matchName = clientRecord?.displayName || clientRecord?.clientName || account?.Name || null;
      const knownTags = knownTagsForAccount(accountId);

      setExternalData({
        tickets: matchFreshdeskTickets({
          tickets: freshdeskData.tickets, companies: freshdeskData.companies,
          freshdeskCompanyId: clientRecord?.freshdeskCompanyId, matchName, knownTags,
        }),
        issues: matchJiraIssues({ issues: jiraData.issues, knownTags, matchName }),
        dags: matchAstroDags({ dags: astroData.dags, runsByDagId: astroData.runsByDagId, knownTags, matchName }),
      });
      setMaxioBilling(buildMaxioBilling({
        customers: maxioData.customers, contracts: maxioData.contracts,
        transactions: maxioData.transactions, items: maxioData.items,
        accountId, matchName,
      }));
    })
      .finally(() => setExternalDataLoading(false));
  }, [accountId, account?.Name]);

  const usageClientId = usage?.clientId || null;

  // Fetch per-user activity for the inline Usage section (mirrors UsageCategoryPanel)
  useEffect(() => {
    if (!usage?.mapped || !usageClientId) { setUsers([]); setUsersLoading(false); return; }
    setUsersLoading(true);
    fetchAccountUsers({ accountId, clientId: usageClientId, daysBack: usersDaysBack })
      .then((data) => setUsers(data.users || []))
      .catch(() => setUsers([]))
      .finally(() => setUsersLoading(false));
  }, [usage?.mapped, usageClientId, accountId, usersDaysBack]);

  const selectedIdsList = useMemo(() => [...selectedUserIds], [selectedUserIds]);

  useEffect(() => {
    if (selectedIdsList.length === 0 || !usageClientId) { setChartActivity([]); return; }
    setChartActivityLoading(true);
    fetchUserActivity({ accountId, clientId: usageClientId, userIds: selectedIdsList, daysBack: usersDaysBack })
      .then((data) => setChartActivity(data.activity || []))
      .catch(() => setChartActivity([]))
      .finally(() => setChartActivityLoading(false));
  }, [accountId, usageClientId, selectedIdsList, usersDaysBack]);

  function toggleUser(userId) {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  }

  const cadence = computeCadence(activities);
  const allActivities = [
    ...(activities?.tasks || []).map(t => ({ ...t, _type: 'task' })),
    ...(activities?.events || []).map(e => ({ ...e, _type: 'event' })),
  ].sort((a, b) => {
    const da = (a._type === 'task' ? a.ActivityDate : a.StartDateTime?.slice(0, 10)) || '';
    const db = (b._type === 'task' ? b.ActivityDate : b.StartDateTime?.slice(0, 10)) || '';
    return db.localeCompare(da);
  });

  const openOpps = (opps || []).filter(o => !o.IsClosed);
  const pipelineOpps = openOpps.filter(o => o.StageName !== 'Client Prospecting');
  const openOppsCount = pipelineOpps.length;
  const wonOpps = (opps || []).filter(o => o.IsWon);
  const wonARR = wonOpps.reduce((s, o) => s + (o.Annual_Recurring_Revenue_ARR__c || 0), 0);

  // Derive last activity from fetched activities (more reliable than SF's
  // LastActivityDate rollup) — restricted to today-or-earlier, since
  // allActivities also includes future-scheduled events/meetings and a
  // "Last Activity" reading "Upcoming" would be contradictory.
  const todayStr = new Date().toISOString().slice(0, 10);
  const pastActivities = allActivities.filter(a => {
    const d = a._type === 'task' ? a.ActivityDate : a.StartDateTime?.slice(0, 10);
    return d && d <= todayStr;
  });
  const lastActivityDate = pastActivities.length > 0
    ? (pastActivities[0]._type === 'task'
        ? pastActivities[0].ActivityDate
        : pastActivities[0].StartDateTime?.slice(0, 10))
    : null;

  const clientStatus = isClientTier(account?.AccountType_Tier__c) ? 'Client' : 'Prospect';

  const usageMetrics = usage?.usage;
  const distinctUsers = usage?.distinctUsers;
  const l3Issues = externalData.issues.filter(isL3Issue);
  const servers = usage?.usageByServer || [];

  const tableUsers = useMemo(() => {
    if (selectedUserIds.size > 0) return users.filter((u) => selectedUserIds.has(u.RS_USER_ID));
    return userTypeFilter === 'all' ? users : users.filter((u) => u.USER_TYPE === userTypeFilter);
  }, [users, selectedUserIds, userTypeFilter]);

  const selectedAggregate = useMemo(() => {
    if (selectedUserIds.size === 0) return null;
    const rows = users.filter((u) => selectedUserIds.has(u.RS_USER_ID));
    return {
      runCount:      rows.reduce((s, u) => s + (u.RUN_COUNT || 0), 0),
      queryCount:    rows.reduce((s, u) => s + (u.QUERY_COUNT || 0), 0),
      forecastCount: rows.reduce((s, u) => s + (u.FORECAST_COUNT || 0), 0),
      activeDays:    rows.reduce((s, u) => s + (u.ACTIVE_DAYS || 0), 0),
      loanCount:     rows.reduce((s, u) => s + (u.LOAN_COUNT || 0), 0),
      securityCount: rows.reduce((s, u) => s + (u.SECURITY_COUNT || 0), 0),
      securityTypes: flattenTypeCounts(...rows.map((u) => u.SECURITY_TYPES)),
      analyticsTypes: flattenTypeCounts(...rows.map((u) => u.ANALYTICS_TYPES)),
    };
  }, [users, selectedUserIds]);
  const activeModules = [...new Set(maxioBilling.lines.filter((l) => l.isActive).map((l) => l.itemName).filter(Boolean))];
  const maxioArrSeries = useMemo(() => buildMaxioArrSeries(maxioBilling.lines), [maxioBilling.lines]);

  return (
    // -m-6 bleeds outside PageShell's p-6 so the navy header extends
    // edge-to-edge. overflow-x-hidden guards against that same negative
    // margin spilling past <main>'s right edge and triggering a stray
    // horizontal-scroll sliver in the browser's scrollbar chrome.
    <div className="-m-6 overflow-x-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-rs-navy text-white px-6 py-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-white/50 hover:text-white text-xs mb-3 transition-colors"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Back to Accounts
        </button>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        ) : (
          <>
            <div className="flex items-start gap-2.5 flex-wrap">
              <h1 className="text-xl font-semibold">{account?.Name || '—'}</h1>
              {account?.AccountType_Tier__c && (
                <span className="mt-0.5 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-white/10 text-white/90">
                  {account.AccountType_Tier__c}
                </span>
              )}
              <span className={`mt-0.5 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold
                ${clientStatus === 'Client' ? 'bg-green-500/20 text-green-200' : 'bg-amber-500/20 text-amber-200'}`}>
                {clientStatus}
              </span>
              {account?.Current_ARR__c > 0 && (
                <span className="mt-0.5 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rs-teal/20 text-rs-teal">
                  ARR {formatARR(account.Current_ARR__c)}
                </span>
              )}
              {usage?.health?.HEALTH_STATUS && (
                <span className={`mt-0.5 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${HEALTH_STYLES[usage.health.HEALTH_STATUS] || 'bg-slate-100 text-slate-600'}`}>
                  {usage.health.HEALTH_STATUS} Health
                  {usage.health.OVERALL_HEALTH_SCORE != null ? ` · ${usage.health.OVERALL_HEALTH_SCORE}/100` : ''}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 mt-2 text-white/50 text-xs flex-wrap">
              {account?.Industry && <span>{account.Industry}</span>}
              {(account?.BillingCity || account?.BillingState) && (
                <span className="flex items-center gap-1">
                  <MapPinIcon className="h-3 w-3" />
                  {[account.BillingCity, account.BillingState].filter(Boolean).join(', ')}
                </span>
              )}
              {account?.Website && (
                <a
                  href={account.Website.startsWith('http') ? account.Website : `https://${account.Website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-white transition-colors"
                >
                  <GlobeAltIcon className="h-3 w-3" />
                  {account.Website.replace(/^https?:\/\//, '')}
                </a>
              )}
              {account?.Sales_Lead__r?.Name && (
                <span>Sales Lead: {account.Sales_Lead__r.Name}</span>
              )}
            </div>

            {usage?.health?.KEY_RISK_FACTORS?.length > 0 && (
              <ul className="text-[11px] text-amber-200 list-disc list-inside space-y-0.5 mt-2">
                {usage.health.KEY_RISK_FACTORS.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            )}
          </>
        )}
      </div>

      {/* ── Sections ───────────────────────────────────────────────────────── */}
      {/* Main column: the operational snapshot (deals/usage/support/billing/
          dev/batch) — what's actually happening at the company right now.
          Sidebar: softer relationship context (account plan, contacts,
          engagement cadence) — still one click away, just de-prioritized. */}
      <div className="p-6 grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-8 min-w-0">

          {/* Overview — Maxio billing stats on left, ARR trend chart filling
              the right side. Open Deals shown separately below. */}
          <section>
            <SectionLabel>Overview</SectionLabel>
            {externalDataLoading || loading ? (
              <Skeleton className="h-28 w-full" />
            ) : (
              <div
                className="rounded-card border border-rs-border bg-white px-5 py-4 flex items-start gap-6"
                onClick={maxioBilling.lines.length > 0 ? () => setOpenPanel({ type: 'maxio' }) : undefined}
                style={maxioBilling.lines.length > 0 ? { cursor: 'pointer' } : undefined}
              >
                {/* Billing stats */}
                <div className="flex-none space-y-3">
                  <div className="flex gap-8">
                    {[
                      {
                        label: 'ARR (Maxio)',
                        value: formatMoneyExact(maxioBilling.arr),
                        sub: null,
                      },
                      {
                        label: 'Next Renewal',
                        value: maxioBilling.nextRenewalDate || '—',
                        sub: maxioBilling.nextRenewalDate ? relativeDate(maxioBilling.nextRenewalDate) : null,
                      },
                    ].map(({ label, value, sub }) => (
                      <div key={label} className="flex flex-col gap-0.5 group">
                        <p className="text-[11px] text-rs-muted">{label}</p>
                        <p className="text-base font-semibold text-rs-text leading-tight group-hover:text-rs-teal transition-colors">
                          {value}
                        </p>
                        {sub && <p className="text-[11px] text-rs-muted">{sub}</p>}
                      </div>
                    ))}
                  </div>
                  {wonOpps.length > 0 && (
                    <p className="text-xs text-rs-muted">
                      {wonOpps.length} closed-won deal{wonOpps.length !== 1 ? 's' : ''} · {formatARR(wonARR)} ARR won
                    </p>
                  )}
                </div>

                {/* ARR trend chart fills remaining space */}
                {maxioArrSeries.length > 0 && (
                  <div className="flex-1 min-w-0 -mt-1">
                    <MaxioArrChart data={maxioArrSeries} compact />
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Open Deals — inline mini-table (Client Prospecting excluded),
              click row → DealDetailPanel */}
          <SectionCard
            title="Open Deals"
            badge={openOppsCount > 0 ? `${openOppsCount} open` : undefined}
            loading={loading}
          >
            {pipelineOpps.length === 0 ? (
              <p className="px-4 py-5 text-xs text-rs-muted">No open deals.</p>
            ) : (
              <table className="w-full table-fixed text-xs">
                <thead>
                  <tr className="text-rs-muted uppercase tracking-wide text-[10px] border-b border-rs-border bg-rs-surface">
                    <th className="w-[38%] text-left px-4 py-2 font-semibold">Account</th>
                    <th className="w-[28%] text-left px-3 py-2 font-semibold">Stage</th>
                    <th className="w-[16%] text-right px-3 py-2 font-semibold">ARR</th>
                    <th className="w-[18%] text-right px-3 py-2 font-semibold">Close Date</th>
                  </tr>
                </thead>
                <tbody>
                  {[...pipelineOpps]
                    .sort((a, b) => (a.CloseDate || '').localeCompare(b.CloseDate || ''))
                    .map((deal) => (
                      <tr key={deal.Id} onClick={() => setActiveDeal(deal)} className="border-b border-rs-border/50 hover:bg-rs-surface cursor-pointer transition-colors">
                        <td className="px-4 py-2 truncate font-medium text-rs-text">{deal.Account?.Name || deal.Name || '—'}</td>
                        <td className="px-3 py-2 truncate text-rs-muted">{deal.StageName || '—'}</td>
                        <td className="px-3 py-2 text-right font-medium text-rs-text">{formatARR(deal.Annual_Recurring_Revenue_ARR__c ?? deal.Amount)}</td>
                        <td className="px-3 py-2 text-right text-rs-muted whitespace-nowrap">{deal.CloseDate ? format(new Date(deal.CloseDate + 'T00:00:00'), 'MMM d') : '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </SectionCard>

          {/* Support Tickets — inline mini-table, click row → TicketDetailPanel */}
          <SectionCard
            title="Support Tickets (Freshdesk)"
            badge={(() => { const n = externalData.tickets.filter(t => t.status === 2 || t.status === 3).length; return n > 0 ? `${n} open` : undefined; })()}
            onViewAll={externalData.tickets.length > 0 ? () => setOpenPanel({ type: 'tickets' }) : undefined}
            loading={externalDataLoading}
          >
            {externalData.tickets.length === 0 ? (
              <p className="px-4 py-5 text-xs text-rs-muted">No tickets matched for this account.</p>
            ) : (
              <table className="w-full table-fixed text-xs">
                <thead>
                  <tr className="text-rs-muted uppercase tracking-wide text-[10px] border-b border-rs-border bg-rs-surface">
                    <th className="w-[55%] text-left px-4 py-2 font-semibold">Subject</th>
                    <th className="w-[20%] text-left px-3 py-2 font-semibold">Status</th>
                    <th className="w-[25%] text-right px-3 py-2 font-semibold">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {[...externalData.tickets]
                    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
                    .slice(0, 5)
                    .map((t) => (
                      <tr key={t.id} onClick={() => setActiveTicket(t)} className="border-b border-rs-border/50 hover:bg-rs-surface cursor-pointer transition-colors">
                        <td className="px-4 py-2 truncate text-rs-text">{t.subject || '—'}</td>
                        <td className="px-3 py-2">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${FD_STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-500'}`}>
                            {FD_STATUS_LABELS[t.status] || t.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-rs-muted">{t.updated_at ? format(new Date(t.updated_at), 'MMM d') : '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </SectionCard>

          {/* Jira / L3 Issues — only shown when there are any */}
          {(externalData.issues.length > 0 || l3Issues.length > 0) && (
            <SectionCard
              title="Jira Issues"
              badge={(() => { const all = [...externalData.issues, ...l3Issues]; const open = all.filter(i => (i.fields?.status?.name || '').toLowerCase() !== 'done').length; return open > 0 ? `${open} open` : undefined; })()}
              onViewAll={() => setOpenPanel({ type: 'issues' })}
              loading={externalDataLoading}
            >
              <table className="w-full table-fixed text-xs">
                <thead>
                  <tr className="text-rs-muted uppercase tracking-wide text-[10px] border-b border-rs-border bg-rs-surface">
                    <th className="w-[15%] text-left px-4 py-2 font-semibold">Key</th>
                    <th className="w-[50%] text-left px-3 py-2 font-semibold">Summary</th>
                    <th className="w-[20%] text-left px-3 py-2 font-semibold">Status</th>
                    <th className="w-[15%] text-right px-3 py-2 font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {[...externalData.issues, ...l3Issues]
                    .sort((a, b) => (b.fields?.created || '').localeCompare(a.fields?.created || ''))
                    .slice(0, 5)
                    .map((issue) => {
                      const statusName = issue.fields?.status?.name || '—';
                      const isDone = statusName.toLowerCase() === 'done';
                      return (
                        <tr
                          key={issue.id}
                          onClick={() => isL3Issue(issue) ? setActiveL3Issue(issue) : setActiveIssue(issue)}
                          className="border-b border-rs-border/50 hover:bg-rs-surface cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-2 font-mono text-rs-muted">{issue.key || '—'}</td>
                          <td className="px-3 py-2 truncate text-rs-text">{issue.fields?.summary || '—'}</td>
                          <td className="px-3 py-2">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${isDone ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                              {statusName}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right text-rs-muted whitespace-nowrap">
                            {issue.fields?.created ? format(new Date(issue.fields.created), 'MMM d') : '—'}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </SectionCard>
          )}

          {/* Live Batch Status — inline mini-table, click row → BatchDetailPanel */}
          {externalData.dags.length > 0 && (
            <SectionCard
              title="Live Batch Status (Astronomer)"
              badge={`${externalData.dags.length} DAG${externalData.dags.length !== 1 ? 's' : ''}`}
              onViewAll={() => setOpenPanel({ type: 'liveDags' })}
              loading={externalDataLoading}
            >
              <table className="w-full table-fixed text-xs">
                <thead>
                  <tr className="text-rs-muted uppercase tracking-wide text-[10px] border-b border-rs-border bg-rs-surface">
                    <th className="w-[50%] text-left px-4 py-2 font-semibold">DAG</th>
                    <th className="w-[20%] text-left px-3 py-2 font-semibold">Last Run</th>
                    <th className="w-[30%] text-right px-3 py-2 font-semibold">Next Run</th>
                  </tr>
                </thead>
                <tbody>
                  {externalData.dags.map((dag) => {
                    const lastRun = lastRunOf(dag);
                    return (
                      <tr key={dag.dag_id} onClick={() => setActiveDag(dag)} className="border-b border-rs-border/50 hover:bg-rs-surface cursor-pointer transition-colors">
                        <td className="px-4 py-2 truncate text-rs-text font-medium">{dag.dag_id}</td>
                        <td className="px-3 py-2">
                          {lastRun?.state ? (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${dagStateBadgeCls(lastRun.state)}`}>
                              {lastRun.state}
                            </span>
                          ) : <span className="text-rs-muted">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-rs-muted whitespace-nowrap">
                          {dag.next_dagrun_run_after ? format(new Date(dag.next_dagrun_run_after), 'MMM d, h:mm a') : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </SectionCard>
          )}

          {/* Usage Trends — full inline usage section with all UsageCategoryPanel
              controls: metrics grid, chart, user filter, user breakdown table */}
          <section>
            <SectionLabel>Usage (Snowflake)</SectionLabel>
            {usageLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
            ) : !usage?.mapped ? (
              <div className="bg-rs-surface border border-dashed border-rs-border rounded-lg p-6 text-center">
                <p className="text-xs text-rs-muted">No Snowflake usage data mapped for this account.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Users filter + range picker */}
                <div className="rounded-card border border-rs-border bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-rs-muted">Users</p>
                    <div className="flex gap-1">
                      {USER_RANGES.map((r) => (
                        <button
                          key={r.key}
                          onClick={() => setUsersDaysBack(r.key)}
                          className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                            usersDaysBack === r.key ? 'bg-rs-teal text-white border-rs-teal' : 'text-rs-muted border-rs-border hover:border-rs-teal/50'
                          }`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {usersLoading ? (
                    <div className="flex gap-1.5">
                      {[1, 2, 3].map((i) => <div key={i} className="h-6 w-20 bg-rs-surface rounded-full animate-pulse" />)}
                    </div>
                  ) : users.length === 0 ? (
                    <p className="text-xs text-rs-muted">No user-level activity in this range.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {users.map((u) => {
                        const isSelected = selectedUserIds.has(u.RS_USER_ID);
                        return (
                          <button
                            key={u.RS_USER_ID}
                            onClick={() => toggleUser(u.RS_USER_ID)}
                            className={`text-[11px] px-2 py-1 rounded-full border transition-colors flex items-center gap-1 ${
                              isSelected ? 'bg-rs-teal text-white border-rs-teal' : 'text-rs-text border-rs-border hover:border-rs-teal/50'
                            }`}
                          >
                            {u.RS_USER_ID}
                            {u.USER_TYPE === 'System/Batch' && (
                              <span className={`text-[9px] ${isSelected ? 'text-white/70' : 'text-purple-500'}`}>(sys)</span>
                            )}
                          </button>
                        );
                      })}
                      {selectedUserIds.size > 0 && (
                        <button onClick={() => setSelectedUserIds(new Set())} className="text-[11px] px-2 py-1 rounded-full text-rs-muted hover:text-rs-text underline">
                          Clear ({selectedUserIds.size})
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Chart + stats grid */}
                <div className="rounded-card border border-rs-border bg-white p-4 space-y-4">
                  {selectedAggregate ? (
                    <>
                      {chartActivityLoading ? (
                        <div className="h-40 flex items-center justify-center text-xs text-rs-muted">Loading…</div>
                      ) : chartActivity.length === 0 ? (
                        <div className="h-40 flex items-center justify-center text-xs text-rs-muted">No run activity for this selection.</div>
                      ) : (
                        <RunActivityChart activity={chartActivity} height={220} />
                      )}
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { label: 'Total Runs',    value: selectedAggregate.runCount },
                          { label: 'Query Runs',    value: selectedAggregate.queryCount },
                          { label: 'Forecast Runs', value: selectedAggregate.forecastCount },
                          { label: 'Active Days',   value: selectedAggregate.activeDays },
                          { label: 'Loans',         value: selectedAggregate.loanCount || null },
                          { label: 'Securities',    value: selectedAggregate.securityCount || null },
                        ].map(({ label, value }) => (
                          <div key={label} className="rounded-lg border border-rs-border bg-rs-surface p-3">
                            <p className="text-[11px] text-rs-muted mb-0.5">{label}</p>
                            <p className="text-sm font-semibold text-rs-text">{value != null ? Math.round(value).toLocaleString() : '—'}</p>
                          </div>
                        ))}
                      </div>
                      {selectedAggregate.securityTypes.length > 0 && (
                        <div>
                          <p className="text-[10px] text-rs-muted mb-1">Security type</p>
                          <TypePills counts={Object.fromEntries(selectedAggregate.securityTypes)} />
                        </div>
                      )}
                      {selectedAggregate.analyticsTypes.length > 0 && (
                        <div>
                          <p className="text-[10px] text-rs-muted mb-1">Forecast type</p>
                          <TypePills counts={Object.fromEntries(selectedAggregate.analyticsTypes)} />
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <UsageChart accountId={accountId} clientId={usageClientId} onWindowChange={setChartWindow} />
                      <div className="grid grid-cols-3 gap-3">
                        {METRICS.map((m) => (
                          <div key={m.key} className="rounded-lg border border-rs-border bg-rs-surface p-3">
                            <p className="text-[11px] text-rs-muted mb-0.5">{m.label} ({chartWindow.lookbackLabel})</p>
                            <p className="text-sm font-semibold text-rs-text">
                              {chartWindow.loading ? '…' : formatMetricValue(m, aggregateMetric(chartWindow.dailyRows, m))}
                            </p>
                          </div>
                        ))}
                      </div>
                      {(distinctUsers?.USER_RUNS || distinctUsers?.SYSTEM_RUNS) ? (
                        <p className="text-[11px] text-rs-muted">
                          {formatNum(distinctUsers.USER_DISTINCT_USERS)} end user{distinctUsers.USER_DISTINCT_USERS === 1 ? '' : 's'} ({formatNum(distinctUsers.USER_RUNS)} runs) ·{' '}
                          {formatNum(distinctUsers.SYSTEM_DISTINCT_USERS)} system/batch account{distinctUsers.SYSTEM_DISTINCT_USERS === 1 ? '' : 's'} ({formatNum(distinctUsers.SYSTEM_RUNS)} runs)
                        </p>
                      ) : null}
                      {servers.length > 0 && (
                        <div>
                          <p className="text-[10px] text-rs-muted mb-1">Forecast runs by server (30 days)</p>
                          <div className="flex flex-wrap gap-2">
                            {servers.map((s) => (
                              <span key={s.SERVER_NAME} className="text-[11px] bg-rs-surface border border-rs-border/50 rounded-full px-2 py-0.5">
                                {s.SERVER_NAME}: <span className="font-semibold text-rs-text">{formatNum(s.RUN_COUNT)}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* DaaS/RaaS link */}
                {(usage?.datasets || []).length > 0 && (
                  <div className="flex justify-end">
                    <button onClick={() => setOpenPanel({ type: 'datasets' })} className="text-xs text-rs-teal hover:underline">
                      View {usage.datasets.length} DaaS/RaaS dataset{usage.datasets.length !== 1 ? 's' : ''} →
                    </button>
                  </div>
                )}

                {/* User breakdown table */}
                <div className="rounded-card border border-rs-border bg-white overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-rs-border bg-rs-surface">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-rs-muted">User Breakdown</p>
                    {selectedUserIds.size === 0 && (
                      <div className="flex gap-1">
                        {USER_TYPE_FILTERS.map((f) => (
                          <button
                            key={f.key}
                            onClick={() => setUserTypeFilter(f.key)}
                            className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                              userTypeFilter === f.key ? 'bg-rs-teal text-white border-rs-teal' : 'text-rs-muted border-rs-border hover:border-rs-teal/50'
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {usersLoading ? (
                    <div className="p-4 space-y-2">
                      {[1, 2, 3].map((i) => <div key={i} className="h-8 bg-rs-surface rounded animate-pulse" />)}
                    </div>
                  ) : tableUsers.length === 0 ? (
                    <p className="px-4 py-5 text-xs text-rs-muted">No user activity in this range.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-rs-muted uppercase tracking-wide text-[10px] border-b border-rs-border">
                            <th className="text-left py-2 px-3 font-semibold">User</th>
                            <th className="text-left py-2 pr-2 font-semibold">Type</th>
                            <th className="text-right py-2 pr-2 font-semibold">Runs</th>
                            <th className="text-right py-2 pr-2 font-semibold">Query</th>
                            <th className="text-right py-2 pr-2 font-semibold">Forecast</th>
                            <th className="text-right py-2 pr-2 font-semibold">Active Days</th>
                            <th className="text-right py-2 pr-2 font-semibold">Loans</th>
                            <th className="text-left py-2 pr-2 font-semibold">Security Type</th>
                            <th className="text-left py-2 pr-2 font-semibold">Forecast Type</th>
                            <th className="text-left py-2 pr-2 font-semibold">Last Active</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tableUsers.map((u) => {
                            const isExpanded = expandedUserId === u.RS_USER_ID;
                            return (
                              <Fragment key={u.RS_USER_ID}>
                                <tr className="border-b border-rs-border/50 hover:bg-rs-surface/60 transition-colors">
                                  <td className="py-2 px-3 text-rs-text font-medium">{u.RS_USER_ID}</td>
                                  <td className="py-2 pr-2">
                                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${u.USER_TYPE === 'System/Batch' ? 'bg-purple-100 text-purple-700' : 'bg-teal-50 text-rs-teal'}`}>
                                      {u.USER_TYPE === 'System/Batch' ? 'Sys/Batch' : 'User'}
                                    </span>
                                  </td>
                                  <td className="py-2 pr-2 text-right text-rs-text font-medium">{formatNum(u.RUN_COUNT)}</td>
                                  <td className="py-2 pr-2 text-right">
                                    <button onClick={() => setExpandedUserId(isExpanded ? null : u.RS_USER_ID)} className="text-rs-teal font-medium hover:underline">
                                      {formatNum(u.QUERY_COUNT)}
                                    </button>
                                  </td>
                                  <td className="py-2 pr-2 text-right">
                                    <button onClick={() => setExpandedUserId(isExpanded ? null : u.RS_USER_ID)} className="text-amber-600 font-medium hover:underline">
                                      {formatNum(u.FORECAST_COUNT)}
                                    </button>
                                  </td>
                                  <td className="py-2 pr-2 text-right text-rs-muted">{formatNum(u.ACTIVE_DAYS)}</td>
                                  <td className="py-2 pr-2 text-right text-rs-muted">{u.LOAN_COUNT ? formatNum(u.LOAN_COUNT) : '—'}</td>
                                  <td className="py-2 pr-2 max-w-[200px]"><TypePills counts={u.SECURITY_TYPES} /></td>
                                  <td className="py-2 pr-2 max-w-[200px]"><TypePills counts={u.ANALYTICS_TYPES} /></td>
                                  <td className="py-2 pr-2 text-rs-muted whitespace-nowrap">{relativeDate(u.LAST_ACTIVE)}</td>
                                </tr>
                                {isExpanded && (
                                  <UserActivityRow
                                    userId={u.RS_USER_ID}
                                    accountId={accountId}
                                    clientId={usageClientId}
                                    daysBack={usersDaysBack}
                                  />
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Sidebar */}
        <div className="col-span-1 space-y-8">

          {/* Activity & Engagement */}
          <section>
            <SectionLabel>Activity &amp; Engagement</SectionLabel>
            <div className="mb-3">
              {loading ? (
                <Skeleton className="h-14 w-full" />
              ) : (
                <StatTile
                  label="Last Activity"
                  value={lastActivityDate ? relativeDate(lastActivityDate) : '—'}
                  sublabel={`${allActivities.length} activit${allActivities.length === 1 ? 'y' : 'ies'} (1yr)`}
                  onClick={allActivities.length > 0 ? () => setOpenPanel({ type: 'activity' }) : undefined}
                />
              )}
            </div>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-3 w-full" />)}
              </div>
            ) : (
              <div className="space-y-1.5">
                <CadenceBar label="7 days" count={cadence.last7} total={Math.max(cadence.last365, 1)} />
                <CadenceBar label="90 days" count={cadence.last90} total={Math.max(cadence.last365, 1)} />
                <CadenceBar label="1 year" count={cadence.last365} total={Math.max(cadence.last365, 1)} />
              </div>
            )}
          </section>

          {/* Current Modules — which Maxio subscription lines are active
              right now, deduped by module/item name. Distinct from the
              Account Plan below it since it's actual contract state, not a
              sales note. */}
          <section>
            <SectionLabel>Current Modules</SectionLabel>
            {externalDataLoading ? (
              <Skeleton className="h-14 w-full" />
            ) : activeModules.length === 0 ? (
              <div className="bg-rs-surface rounded-lg p-4 text-xs text-rs-muted">
                No active modules
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {activeModules.map((m) => (
                  <button
                    key={m}
                    onClick={() => setOpenPanel({ type: 'maxio' })}
                    className="text-xs font-medium px-2.5 py-1 rounded-full bg-rs-teal/10 text-rs-teal border border-rs-teal/30 hover:bg-rs-teal/20 transition-colors"
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Account Plan */}
          <section>
            <SectionLabel>Account Plan</SectionLabel>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : (!account?.Sales_Next_Steps__c && !account?.Existing_Connections__c) ? (
              <div className="bg-rs-surface rounded-lg p-4 text-xs text-rs-muted">
                No account plan recorded in Salesforce.{' '}
                <span className="text-rs-text font-medium">
                  Expected fields: Sales_Next_Steps__c, Existing_Connections__c
                </span>
              </div>
            ) : (
              <div className="space-y-4">
                {account?.Sales_Next_Steps__c && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-rs-muted mb-1">Next Steps</p>
                    <p className="text-sm text-rs-text whitespace-pre-wrap leading-relaxed">
                      {account.Sales_Next_Steps__c}
                    </p>
                  </div>
                )}
                {account?.Existing_Connections__c && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-rs-muted mb-1">Existing Connections</p>
                    <p className="text-sm text-rs-text whitespace-pre-wrap leading-relaxed">
                      {account.Existing_Connections__c}
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Key Contacts */}
          <section>
            <SectionLabel>Key Contacts</SectionLabel>
            {loading ? (
              <Skeleton className="h-14 w-full" />
            ) : (
              <StatTile
                label="Contacts"
                value={(contacts || []).length}
                onClick={(contacts || []).length > 0 ? () => setOpenPanel({ type: 'contacts' }) : undefined}
              />
            )}
          </section>
        </div>
      </div>

      {/* ── List-level panels — mutually exclusive via openPanel ────────────── */}
      <PipelineListPanel
        deals={openPanel?.type === 'deals' ? openOpps : null}
        title="Open Deals"
        onClose={() => setOpenPanel(null)}
        onDealClick={(deal) => { setOpenPanel(null); setActiveDeal(deal); }}
      />
      <ContactListPanel
        contacts={openPanel?.type === 'contacts' ? contacts : null}
        onClose={() => setOpenPanel(null)}
      />
      <ActivityListPanel
        activities={openPanel?.type === 'activity' ? allActivities : null}
        onClose={() => setOpenPanel(null)}
      />
      <SimpleTablePanel
        open={openPanel?.type === 'datasets'}
        onClose={() => setOpenPanel(null)}
        title="DaaS / RaaS Datasets"
        subtitle="Best-effort match by name"
        columns={DAAS_COLUMNS}
        rows={usage?.datasets || []}
      />
      <SimpleTablePanel
        open={openPanel?.type === 'maxio'}
        onClose={() => setOpenPanel(null)}
        title="Billing (Maxio)"
        subtitle="Every subscription line item — active, expired, and cancelled"
        columns={MAXIO_COLUMNS}
        rows={maxioBilling.lines}
        rowKey="id"
        chart={<MaxioArrChart data={maxioArrSeries} />}
      />
      <TicketListPanel
        tickets={openPanel?.type === 'tickets' ? externalData.tickets : null}
        onClose={() => setOpenPanel(null)}
        onTicketClick={(t) => { setOpenPanel(null); setActiveTicket(t); }}
      />
      <JiraListPanel
        issues={openPanel?.type === 'issues' ? externalData.issues : null}
        onClose={() => setOpenPanel(null)}
        onIssueClick={(i) => { setOpenPanel(null); setActiveIssue(i); }}
      />
      <JiraListPanel
        issues={openPanel?.type === 'l3' ? l3Issues : null}
        title="L3 Tickets"
        onClose={() => setOpenPanel(null)}
        onIssueClick={(i) => { setOpenPanel(null); setActiveL3Issue(i); }}
      />
      <BatchListPanel
        dags={openPanel?.type === 'liveDags' ? externalData.dags : null}
        onClose={() => setOpenPanel(null)}
        onDagClick={(d) => { setOpenPanel(null); setActiveDag(d); }}
      />

      {/* ── Detail-level panels ──────────────────────────────────────────────── */}
      {activeDeal && (
        <DealDetailPanel deal={activeDeal} onClose={() => setActiveDeal(null)} />
      )}
      <TicketDetailPanel
        ticket={activeTicket}
        onClose={() => setActiveTicket(null)}
        onBack={() => { setActiveTicket(null); setOpenPanel({ type: 'tickets' }); }}
      />
      <JiraDetailPanel
        issue={activeIssue}
        onClose={() => setActiveIssue(null)}
        onBack={() => { setActiveIssue(null); setOpenPanel({ type: 'issues' }); }}
      />
      <JiraDetailPanel
        issue={activeL3Issue}
        onClose={() => setActiveL3Issue(null)}
        onBack={() => { setActiveL3Issue(null); setOpenPanel({ type: 'l3' }); }}
      />
      <BatchDetailPanel
        dag={activeDag}
        onClose={() => setActiveDag(null)}
        onBack={() => { setActiveDag(null); setOpenPanel({ type: 'liveDags' }); }}
      />
    </div>
  );
}
