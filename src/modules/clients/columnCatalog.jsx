// Static column catalog for the Current Clients page — one row-object key
// per possible column, grouped by source so the column chooser can group
// checkboxes the same way. `key` matches a field produced by
// src/lib/currentClientsMerge.js's mergeCurrentClients().

function formatMoney(v) {
  if (v === null || v === undefined) return '—';
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function formatNum(v) {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString();
}

function relativeDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr.length === 10 ? `${dateStr}T00:00:00` : dateStr);
  const diff = Math.floor((Date.now() - d) / 86400000);
  if (diff < 0) return '—';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 30) return `${diff}d ago`;
  if (diff < 365) return `${Math.floor(diff / 30)}mo ago`;
  return `${Math.floor(diff / 365)}yr ago`;
}

const HEALTH_STYLE = {
  GREEN: 'bg-green-100 text-green-700',
  YELLOW: 'bg-amber-100 text-amber-700',
  RED: 'bg-red-100 text-red-600',
};

const MATCH_STATUS_STYLE = {
  verified: 'bg-green-100 text-green-700',
  confirmed: 'bg-green-100 text-green-700',
  unmatched: 'bg-slate-100 text-slate-500',
};

export const COLUMN_CATALOG = [
  // Salesforce
  { key: 'Name', label: 'Account', group: 'Salesforce' },
  { key: 'Type', label: 'Account Type', group: 'Salesforce' },
  { key: 'AccountType_Tier__c', label: 'Tier', group: 'Salesforce' },
  { key: 'Industry', label: 'Industry', group: 'Salesforce' },
  { key: 'SalesLead', label: 'Sales Lead', group: 'Salesforce' },
  { key: 'Current_ARR__c', label: 'ARR (Salesforce)', group: 'Salesforce', render: (r) => formatMoney(r.Current_ARR__c) },
  { key: 'ArrEndOfMonth', label: 'ARR at End of Month', group: 'Salesforce', render: (r) => formatMoney(r.ArrEndOfMonth) },
  { key: 'OpenOppsCount', label: 'Open Opps', group: 'Salesforce', render: (r) => formatNum(r.OpenOppsCount) },
  { key: 'OwnerName', label: 'Owner', group: 'Salesforce' },
  { key: 'BillingCity', label: 'City', group: 'Salesforce' },
  { key: 'BillingState', label: 'State', group: 'Salesforce' },
  { key: 'Website', label: 'Website', group: 'Salesforce' },
  { key: 'Phone', label: 'Phone', group: 'Salesforce' },
  { key: 'AnnualRevenue', label: 'Annual Revenue', group: 'Salesforce', render: (r) => formatMoney(r.AnnualRevenue) },
  { key: 'LastActivityDate', label: 'Last Activity', group: 'Salesforce', render: (r) => relativeDate(r.LastActivityDate) },
  {
    key: '_snowflakeMatchStatus',
    label: 'Snowflake Match',
    group: 'Salesforce',
    render: (r) => (
      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${MATCH_STATUS_STYLE[r._snowflakeMatchStatus] || 'bg-slate-100 text-slate-500'}`}>
        {r._snowflakeMatchStatus}
      </span>
    ),
  },

  // Health
  {
    key: 'HealthStatus',
    label: 'Health',
    group: 'Health',
    render: (r) => r.HealthStatus
      ? <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${HEALTH_STYLE[r.HealthStatus] || 'bg-slate-100 text-slate-600'}`}>{r.HealthStatus}</span>
      : '—',
  },

  // Usage
  { key: 'ApiCalls30d', label: 'API Calls (30d)', group: 'Usage', render: (r) => formatNum(r.ApiCalls30d) },
  { key: 'Forecasts30d', label: 'Forecast Runs (30d)', group: 'Usage', render: (r) => formatNum(r.Forecasts30d) },
  { key: 'ModelExecutions30d', label: 'Model Executions (30d)', group: 'Usage', render: (r) => formatNum(r.ModelExecutions30d) },
  { key: 'ModelFailures30d', label: 'Model Failures (30d)', group: 'Usage', render: (r) => formatNum(r.ModelFailures30d) },
  { key: 'ScenarioRuns30d', label: 'Scenario Runs (30d)', group: 'Usage', render: (r) => formatNum(r.ScenarioRuns30d) },
  { key: 'StressTests30d', label: 'Stress Tests (30d)', group: 'Usage', render: (r) => formatNum(r.StressTests30d) },
  { key: 'ForecastLoans30d', label: 'Forecast Loans (30d)', group: 'Usage', render: (r) => formatNum(r.ForecastLoans30d) },
  { key: 'ForecastSecurities30d', label: 'Forecast Securities (30d)', group: 'Usage', render: (r) => formatNum(r.ForecastSecurities30d) },
  { key: 'AvgLatencyMs30d', label: 'Avg API Latency (ms)', group: 'Usage', render: (r) => formatNum(r.AvgLatencyMs30d) },
  { key: 'DistinctUsers30d', label: 'Distinct Users (30d)', group: 'Usage', render: (r) => formatNum(r.DistinctUsers30d) },
  { key: 'UserDistinctUsers30d', label: 'Distinct Users, excl. admin/batch (30d)', group: 'Usage', render: (r) => formatNum(r.UserDistinctUsers30d) },

  // Billing (Maxio) — mirrors the same buildMaxioBilling logic used on
  // AccountView's Maxio panel, run once per row against the bulk payload.
  { key: 'MaxioArr', label: 'ARR (Maxio)', group: 'Billing (Maxio)', render: (r) => (r.MaxioArr == null ? '—' : `$${Math.round(r.MaxioArr).toLocaleString()}`) },
  { key: 'MaxioNextRenewal', label: 'Next Renewal (Maxio)', group: 'Billing (Maxio)', render: (r) => relativeDate(r.MaxioNextRenewal) },
  { key: 'MaxioActiveLines', label: 'Active Contract Lines (Maxio)', group: 'Billing (Maxio)', render: (r) => formatNum(r.MaxioActiveLines) },

  // DaaS/RaaS
  { key: 'DaasDatasetCount', label: 'DaaS Datasets', group: 'DaaS/RaaS', render: (r) => formatNum(r.DaasDatasetCount) },
  { key: 'DaasTotalUpb', label: 'DaaS Total UPB', group: 'DaaS/RaaS', render: (r) => formatMoney(r.DaasTotalUpb) },
  { key: 'RaasDatasetCount', label: 'RaaS Datasets', group: 'DaaS/RaaS', render: (r) => formatNum(r.RaasDatasetCount) },
  { key: 'RaasTotalUpb', label: 'RaaS Total UPB', group: 'DaaS/RaaS', render: (r) => formatMoney(r.RaasTotalUpb) },

  // Support (Freshdesk)
  { key: 'FdOpenTickets', label: 'Open Tickets (Freshdesk)', group: 'Support (Freshdesk)', render: (r) => formatNum(r.FdOpenTickets) },
  { key: 'FdEscalatedTickets', label: 'Escalated', group: 'Support (Freshdesk)', render: (r) => formatNum(r.FdEscalatedTickets) },
  { key: 'FdUrgentTickets', label: 'Urgent Priority', group: 'Support (Freshdesk)', render: (r) => formatNum(r.FdUrgentTickets) },
  { key: 'FdAvgFirstResponseHrs', label: 'Avg First Response (hrs)', group: 'Support (Freshdesk)', render: (r) => formatNum(r.FdAvgFirstResponseHrs) },
  { key: 'FdOldestOpenAgeDays', label: 'Oldest Open Ticket (days)', group: 'Support (Freshdesk)', render: (r) => formatNum(r.FdOldestOpenAgeDays) },

  // Dev (Jira)
  { key: 'JiraOpenIssues', label: 'Open Issues', group: 'Dev (Jira)', render: (r) => formatNum(r.JiraOpenIssues) },
  { key: 'JiraHighPriorityIssues', label: 'High/Highest Priority', group: 'Dev (Jira)', render: (r) => formatNum(r.JiraHighPriorityIssues) },
  { key: 'JiraBugCount', label: 'Open Bugs', group: 'Dev (Jira)', render: (r) => formatNum(r.JiraBugCount) },
  { key: 'JiraOldestOpenAgeDays', label: 'Oldest Open Issue (days)', group: 'Dev (Jira)', render: (r) => formatNum(r.JiraOldestOpenAgeDays) },

  // Batch (Live) — Astronomer, current pause/stale/import-error/next-run
  // status, replacing the old Snowflake-sourced historical Batch columns.
  { key: 'AstroDagCount', label: 'Live DAGs', group: 'Batch (Live)', render: (r) => formatNum(r.AstroDagCount) },
  {
    key: 'AstroLastRunState',
    label: 'Last Run Status',
    group: 'Batch (Live)',
    render: (r) => r.AstroLastRunState
      ? <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${r.AstroLastRunState === 'success' ? 'bg-green-100 text-green-700' : r.AstroLastRunState === 'failed' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>{r.AstroLastRunState}</span>
      : '—',
  },
  { key: 'AstroHasImportErrors', label: 'Import Errors', group: 'Batch (Live)', render: (r) => (r.AstroHasImportErrors == null ? '—' : r.AstroHasImportErrors ? 'Yes' : 'No') },
  { key: 'AstroNextRunAfter', label: 'Next Scheduled Run', group: 'Batch (Live)', render: (r) => relativeDate(r.AstroNextRunAfter) },
];

export const COLUMN_GROUPS = [...new Set(COLUMN_CATALOG.map((c) => c.group))];

export const DEFAULT_VISIBLE_COLUMNS = [
  'Name', 'AccountType_Tier__c', 'Industry', 'SalesLead', 'Current_ARR__c',
  'HealthStatus', 'FdOpenTickets', 'DistinctUsers30d',
];
