import { useState, useEffect } from 'react';
import {
  ArrowLeftIcon, MapPinIcon, GlobeAltIcon,
} from '@heroicons/react/24/outline';
import {
  fetchAccountDetail, fetchAccountContacts,
  fetchAccountActivities, fetchAccountOpportunities,
} from '../../datasources/salesforce';
import { fetchAccountUsage, fetchSnowflakeClients } from '../../datasources/snowflake';
import { fetchFreshdeskData } from '../../datasources/freshdesk';
import { fetchJiraData } from '../../datasources/jira';
import { fetchAstronomerData } from '../../datasources/astronomer';
import { fetchMaxioData } from '../../datasources/maxio';
import { matchFreshdeskTickets, matchJiraIssues, matchAstroDags, buildMaxioBilling, knownTagsForAccount } from '../../lib/externalDataMatch';
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
import UsageChart from './UsageChart';

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
  { key: 'home_arr_amount', label: 'ARR', render: (t) => formatMoney(Number(t.home_arr_amount) || 0) },
  { key: 'home_amount', label: 'Line Value', render: (t) => formatMoney(Number(t.home_amount) || 0) },
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
  const [openPanel, setOpenPanel] = useState(null); // { type: 'deals'|'contacts'|'activity'|'usage'|'datasets'|'tickets'|'issues'|'l3'|'liveDags' }
  const [activeDeal, setActiveDeal] = useState(null);
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
  // Astronomer fetches the Current Clients page uses (5-min cached, so this
  // isn't a new per-account network cost) and filters to just this account.
  useEffect(() => {
    setExternalDataLoading(true);
    setExternalData({ tickets: [], issues: [], dags: [] });
    Promise.all([
      fetchSnowflakeClients(),
      fetchFreshdeskData(),
      fetchJiraData(),
      fetchAstronomerData(),
      fetchMaxioData(),
    ]).then(([snowflakeClients, freshdeskData, jiraData, astroData, maxioData]) => {
      const overrideClientId = findConfirmedClientId(accountId);
      const directClient = snowflakeClients.find((c) => c.salesforceAccountId === accountId);
      const clientId = overrideClientId || directClient?.clientId || null;
      const clientRecord = clientId ? snowflakeClients.find((c) => c.clientId === clientId) : null;
      const matchName = clientRecord?.displayName || clientRecord?.clientName || null;
      const knownTags = knownTagsForAccount(accountId);

      setExternalData({
        tickets: matchFreshdeskTickets({
          tickets: freshdeskData.tickets, companies: freshdeskData.companies,
          freshdeskCompanyId: clientRecord?.freshdeskCompanyId, matchName,
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
      .catch(() => {
        setExternalData({ tickets: [], issues: [], dags: [] });
        setMaxioBilling({ arr: 0, nextRenewalDate: null, lines: [] });
      })
      .finally(() => setExternalDataLoading(false));
  }, [accountId]);

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
  const activeModules = [...new Set(maxioBilling.lines.filter((l) => l.isActive).map((l) => l.itemName).filter(Boolean))];

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

          {/* Relationship & Delivery */}
          <section>
            <SectionLabel>Relationship &amp; Delivery</SectionLabel>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-rs-surface rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-widest text-rs-muted">Current ARR</p>
                {loading ? <Skeleton className="h-6 w-16 mt-1" /> : (
                  <button
                    onClick={openOpps.length > 0 ? () => setOpenPanel({ type: 'deals' }) : undefined}
                    disabled={openOpps.length === 0}
                    className={`text-lg font-semibold text-rs-text mt-0.5 ${openOpps.length > 0 ? 'cursor-pointer hover:text-rs-teal transition-colors' : ''}`}
                  >
                    {formatARR(account?.Current_ARR__c)}
                  </button>
                )}
              </div>
              {loading ? (
                <div className="bg-rs-surface rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-widest text-rs-muted">Open Deals</p>
                  <Skeleton className="h-6 w-16 mt-1" />
                </div>
              ) : (
                <StatTile label="Open Deals" value={openOpps.length} onClick={openOpps.length > 0 ? () => setOpenPanel({ type: 'deals' }) : undefined} />
              )}
              {loading ? (
                <div className="bg-rs-surface rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-widest text-rs-muted">Last Activity</p>
                  <Skeleton className="h-6 w-16 mt-1" />
                </div>
              ) : (
                <StatTile
                  label="Last Activity"
                  value={lastActivityDate ? relativeDate(lastActivityDate) : '—'}
                  sublabel={`${allActivities.length} activit${allActivities.length === 1 ? 'y' : 'ies'} (1yr)`}
                  onClick={allActivities.length > 0 ? () => setOpenPanel({ type: 'activity' }) : undefined}
                />
              )}
            </div>

            {!loading && wonOpps.length > 0 && (
              <p className="text-xs text-rs-muted">
                {wonOpps.length} closed-won deal{wonOpps.length !== 1 ? 's' : ''}, {formatARR(wonARR)} total ARR won
              </p>
            )}
          </section>

          {/* Product Usage (Snowflake) */}
          <section>
            <SectionLabel>Product Usage (Snowflake)</SectionLabel>
            {usageLoading ? (
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : !usage?.mapped ? (
              <div className="bg-rs-surface border border-dashed border-rs-border rounded-lg p-6 text-center">
                <p className="text-xs text-rs-muted">No Snowflake usage data mapped for this account — check Account Mapping</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <StatTile
                  label="Queries (30d)"
                  value={formatNum(usageMetrics?.API_CALLS_30D)}
                  onClick={() => setOpenPanel({ type: 'usage' })}
                />
                <StatTile
                  label="Forecast Runs (30d)"
                  value={formatNum(usageMetrics?.FORECASTS_30D)}
                  onClick={() => setOpenPanel({ type: 'usage' })}
                />
                <StatTile
                  label="Distinct Users (30d)"
                  value={formatNum(distinctUsers?.DISTINCT_USERS)}
                  onClick={() => setOpenPanel({ type: 'usage' })}
                />
                <StatTile
                  label="Model Executions (30d)"
                  value={formatNum(usageMetrics?.MODEL_EXECUTIONS_30D)}
                  onClick={() => setOpenPanel({ type: 'usage' })}
                />
                <StatTile
                  label="Avg API Latency (30d)"
                  value={usageMetrics?.AVG_LATENCY_MS_30D != null ? `${Math.round(usageMetrics.AVG_LATENCY_MS_30D)}ms` : '—'}
                  onClick={() => setOpenPanel({ type: 'usage' })}
                />
                <StatTile
                  label="DaaS / RaaS Datasets"
                  value={(usage.datasets || []).length}
                  onClick={(usage.datasets || []).length > 0 ? () => setOpenPanel({ type: 'datasets' }) : undefined}
                />
              </div>
            )}
          </section>

          {/* Billing (Maxio) — ARR here is the sum of home_arr_amount across
              currently-active (non-cancelled) subscription line items, the
              actual contract/subscription value, distinct from the
              Salesforce Current_ARR__c figure shown above. */}
          <section>
            <SectionLabel>Billing (Maxio)</SectionLabel>
            {externalDataLoading ? (
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <StatTile
                  label="ARR (Maxio)"
                  value={formatMoney(maxioBilling.arr)}
                  onClick={maxioBilling.lines.length > 0 ? () => setOpenPanel({ type: 'maxio' }) : undefined}
                />
                <StatTile
                  label="Next Renewal"
                  value={maxioBilling.nextRenewalDate || '—'}
                  sublabel={maxioBilling.nextRenewalDate ? relativeDate(maxioBilling.nextRenewalDate) : undefined}
                  onClick={maxioBilling.lines.length > 0 ? () => setOpenPanel({ type: 'maxio' }) : undefined}
                />
                <StatTile
                  label="Contract Lines"
                  value={maxioBilling.lines.length}
                  onClick={maxioBilling.lines.length > 0 ? () => setOpenPanel({ type: 'maxio' }) : undefined}
                />
              </div>
            )}
          </section>

          {/* Support, Dev & Live Batch Status (Freshdesk / Jira / Astronomer) */}
          <section>
            <SectionLabel>Support, Dev &amp; Live Batch Status</SectionLabel>
            {externalDataLoading ? (
              <div className="grid grid-cols-4 gap-3">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-3">
                <StatTile
                  label="Open Tickets (Freshdesk)"
                  value={externalData.tickets.length}
                  onClick={externalData.tickets.length > 0 ? () => setOpenPanel({ type: 'tickets' }) : undefined}
                />
                <StatTile
                  label="Jira Issues"
                  value={externalData.issues.length}
                  onClick={externalData.issues.length > 0 ? () => setOpenPanel({ type: 'issues' }) : undefined}
                />
                <StatTile
                  label="L3 Tickets"
                  value={l3Issues.length}
                  onClick={l3Issues.length > 0 ? () => setOpenPanel({ type: 'l3' }) : undefined}
                />
                <StatTile
                  label="Live DAGs (Astronomer)"
                  value={externalData.dags.length}
                  onClick={externalData.dags.length > 0 ? () => setOpenPanel({ type: 'liveDags' }) : undefined}
                />
              </div>
            )}
          </section>

          {/* Usage Trends — same flexible chart as the Usage drill-down, given
              room to breathe here since it has no natural drill-down further */}
          <section>
            <SectionLabel>Usage Trends</SectionLabel>
            {usage?.mapped && (
              <UsageChart accountId={accountId} clientId={usage?.clientId} />
            )}
          </section>
        </div>

        {/* Sidebar */}
        <div className="col-span-1 space-y-8">

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

          {/* Activity & Engagement */}
          <section>
            <SectionLabel>Activity &amp; Engagement</SectionLabel>
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
      <UsageCategoryPanel
        open={openPanel?.type === 'usage'}
        onClose={() => setOpenPanel(null)}
        usage={usage}
        accountId={accountId}
        clientId={usage?.clientId}
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
