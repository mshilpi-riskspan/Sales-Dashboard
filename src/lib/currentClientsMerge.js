// Merges Salesforce Account rows with bulk Snowflake client data into one
// flat row per current client, for the Current Clients page. Reuses the
// exact three-tier Account <-> DIM_CLIENT.CLIENT_ID resolution already in
// src/modules/settings/AccountMapping.jsx (direct SALESFORCE_ACCOUNT_ID FK,
// else a confirmed localStorage['snowflakeAccountMap'] override) — an
// unconfirmed fuzzy suggestion is NOT auto-applied here, same as
// AccountMapping.jsx requires an explicit human Accept before it counts.
import { looksLikeMatch, normalizeForTagMatch } from './accountMatch';
import { CLIENT_TAG_TO_ACCOUNT_ID } from '../config/clientTagMap';
import { matchFreshdeskTickets, matchJiraIssues, matchAstroDags, knownTagsForAccount, buildMaxioBilling } from './externalDataMatch';
import { resolveClientMappingStatuses } from './accountMapping';

// Inverted: accountId -> Set<tag> (several tags can map to one account, e.g.
// a client with separate DaaS feeds per product line).
const TAGS_BY_ACCOUNT_ID = new Map();
for (const [tag, accountId] of Object.entries(CLIENT_TAG_TO_ACCOUNT_ID)) {
  if (!TAGS_BY_ACCOUNT_ID.has(accountId)) TAGS_BY_ACCOUNT_ID.set(accountId, new Set());
  TAGS_BY_ACCOUNT_ID.get(accountId).add(tag);
}

const MAP_KEY = 'snowflakeAccountMap';

function loadOverrideMap() {
  try { return JSON.parse(localStorage.getItem(MAP_KEY) || '{}'); }
  catch { return {}; }
}

function keyByClientId(rows) {
  const map = new Map();
  for (const row of rows) if (row.CLIENT_ID) map.set(row.CLIENT_ID, row);
  return map;
}

// Authoritative CLIENT_TAG_TO_ACCOUNT_ID match when we have one (exact,
// case-insensitive — no fuzziness needed for a known tag), falling back to
// name-similarity matching only for clients not in that ground-truth list.
function aggregateDaas(knownTags, matchName, daasRows) {
  let daasCount = 0, daasUpb = 0, raasCount = 0, raasUpb = 0;
  for (const row of daasRows) {
    const isMatch = knownTags.size > 0
      ? knownTags.has((row.COMPANY_NAME || '').toUpperCase())
      : looksLikeMatch(matchName, row.COMPANY_NAME);
    if (!isMatch) continue;
    if (row.MODULE === 'RaaS') {
      raasCount += 1;
      raasUpb += row.TOTAL_UPB || 0;
    } else {
      daasCount += 1;
      daasUpb += row.TOTAL_UPB || 0;
    }
  }
  return {
    DaasDatasetCount: daasCount || null,
    DaasTotalUpb: daasCount ? daasUpb : null,
    RaasDatasetCount: raasCount || null,
    RaasTotalUpb: raasCount ? raasUpb : null,
  };
}

// Same authoritative-tag-first approach as aggregateDaas — CLIENT_TAG/DAG_ID
// substring-matched against the known tag(s) when we have them, else falls
// back to substring-matching the resolved/raw name (accountUsage.js's
// per-client SQL approach, done in JS across every DAG at once here).
function aggregateBatch(knownTags, matchName, batchRows) {
  const fallbackTag = normalizeForTagMatch(matchName);
  const normalizedKnownTags = [...knownTags].map(normalizeForTagMatch).filter(Boolean);
  if (normalizedKnownTags.length === 0 && !fallbackTag) return { BatchDagCount: null, BatchHealthPct: null };

  const matches = batchRows.filter((row) => {
    const clientTag = normalizeForTagMatch(row.CLIENT_TAG);
    const dagId = normalizeForTagMatch(row.DAG_ID);
    if (normalizedKnownTags.length > 0) {
      return normalizedKnownTags.some((t) => clientTag === t || clientTag.includes(t) || dagId.includes(t));
    }
    return clientTag.includes(fallbackTag) || dagId.includes(fallbackTag);
  });
  if (matches.length === 0) return { BatchDagCount: null, BatchHealthPct: null };
  const successCount = matches.filter((m) => m.LAST_RUN_STATE === 'success').length;
  return {
    BatchDagCount: matches.length,
    BatchHealthPct: Math.round((successCount / matches.length) * 100),
  };
}

// ---- Freshdesk / Jira / Astronomer aggregation --------------------------
// Each takes the already-matched (per-account) row subset from
// src/lib/externalDataMatch.js and reduces it to flat summary columns.

function aggregateFreshdesk(tickets) {
  if (!tickets.length) {
    return { FdOpenTickets: null, FdEscalatedTickets: null, FdUrgentTickets: null, FdAvgFirstResponseHrs: null, FdOldestOpenAgeDays: null };
  }
  const open = tickets.filter((t) => t.status === 2 || t.status === 3); // Open, Pending
  const escalated = tickets.filter((t) => t.is_escalated);
  const urgent = tickets.filter((t) => t.priority === 4); // Urgent
  const responseHours = tickets
    .filter((t) => t.stats?.first_responded_at)
    .map((t) => (new Date(t.stats.first_responded_at) - new Date(t.created_at)) / 3600000);
  const oldestOpenAgeDays = open.length
    ? Math.max(...open.map((t) => (Date.now() - new Date(t.created_at)) / 86400000))
    : null;
  return {
    FdOpenTickets: open.length,
    FdEscalatedTickets: escalated.length,
    FdUrgentTickets: urgent.length,
    FdAvgFirstResponseHrs: responseHours.length
      ? Math.round((responseHours.reduce((sum, h) => sum + h, 0) / responseHours.length) * 10) / 10
      : null,
    FdOldestOpenAgeDays: oldestOpenAgeDays != null ? Math.round(oldestOpenAgeDays) : null,
  };
}

function aggregateJira(issues) {
  if (!issues.length) {
    return { JiraOpenIssues: null, JiraHighPriorityIssues: null, JiraBugCount: null, JiraOldestOpenAgeDays: null };
  }
  const open = issues.filter((i) => i.fields?.status?.statusCategory?.key !== 'done');
  const highPriority = open.filter((i) => ['Highest', 'High'].includes(i.fields?.priority?.name));
  const bugs = open.filter((i) => i.fields?.issuetype?.name === 'Bug');
  const oldestOpenAgeDays = open.length
    ? Math.max(...open.map((i) => (Date.now() - new Date(i.fields.created)) / 86400000))
    : null;
  return {
    JiraOpenIssues: open.length,
    JiraHighPriorityIssues: highPriority.length,
    JiraBugCount: bugs.length,
    JiraOldestOpenAgeDays: oldestOpenAgeDays != null ? Math.round(oldestOpenAgeDays) : null,
  };
}

function aggregateAstroLive(dags) {
  if (!dags.length) {
    return { AstroDagCount: null, AstroLastRunState: null, AstroHasImportErrors: null, AstroNextRunAfter: null };
  }
  const nextRuns = dags.map((d) => d.next_dagrun_run_after).filter(Boolean).sort();
  const allRuns = dags.flatMap((d) => d.runs || []).sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
  return {
    AstroDagCount: dags.length,
    AstroLastRunState: allRuns[0]?.state || null,
    AstroHasImportErrors: dags.some((d) => d.has_import_errors),
    AstroNextRunAfter: nextRuns[0] || null,
  };
}

// Reuses buildMaxioBilling (src/lib/externalDataMatch.js) — same
// sf_id-primary/name-fallback matching AccountView.jsx uses per account,
// just called once per row here against the bulk-fetched Maxio payload.
function aggregateMaxio({ customers, contracts, transactions, items }, accountId, matchName) {
  if (!customers?.length) {
    return { MaxioArr: null, MaxioNextRenewal: null, MaxioActiveLines: null };
  }
  const { arr, nextRenewalDate, lines } = buildMaxioBilling({
    customers, contracts: contracts || [], transactions: transactions || [], items: items || [], accountId, matchName,
  });
  const activeLines = lines.filter((l) => l.isActive).length;
  return {
    MaxioArr: activeLines ? arr : null,
    MaxioNextRenewal: nextRenewalDate,
    MaxioActiveLines: activeLines || null,
  };
}

export function mergeCurrentClients({ accounts, snowflakeClients, snowflakeData, openOppCounts, freshdeskData, jiraData, astroData, maxioData, lastActivityByAccount }) {
  const overrideMap = loadOverrideMap();
  const accountsById = new Map((accounts || []).map((a) => [a.Id, a]));

  // accountId -> { clientId, matchStatus } — sourced from the exact same
  // resolveClientMappingStatuses() AccountMapping.jsx itself uses, so the
  // Snowflake Match status shown here can never drift from that page's
  // verified/confirmed/pending/stale/rejected counts. Only verified/confirmed
  // clients actually resolve to an account, so those are the only statuses
  // that can appear here — everything else stays 'unmatched'.
  const accountToClientId = new Map();
  for (const cs of resolveClientMappingStatuses({ accounts, snowflakeClients, overrideMap })) {
    const accountId = cs.resolvedAccountId || cs.mappedAccountId;
    if (accountId) accountToClientId.set(accountId, { clientId: cs.clientId, matchStatus: cs.status });
  }

  // DIM_CLIENT.DISPLAY_NAME (falling back to CLIENT_NAME) is the curated name
  // that actually reconciles with DAAS_DATASET_METRICS/Airflow tags — use it
  // for fuzzy matching instead of the raw Salesforce Account name whenever a
  // CLIENT_ID has resolved.
  const clientNameById = new Map(
    (snowflakeClients || []).map((c) => [c.clientId, c.displayName || c.clientName])
  );
  const freshdeskCompanyIdByClientId = new Map(
    (snowflakeClients || []).map((c) => [c.clientId, c.freshdeskCompanyId])
  );

  const health = keyByClientId(snowflakeData?.health || []);
  const usage = keyByClientId(snowflakeData?.usage || []);
  const distinctUsers = keyByClientId(snowflakeData?.distinctUsers || []);
  const support = keyByClientId(snowflakeData?.support || []);
  const commercial = keyByClientId(snowflakeData?.commercial || []);
  const daasRows = snowflakeData?.daas || [];
  const batchRows = snowflakeData?.batch || [];

  const freshdeskTickets = freshdeskData?.tickets || [];
  const freshdeskCompanies = freshdeskData?.companies || [];
  const jiraIssues = jiraData?.issues || [];
  const astroDags = astroData?.dags || [];
  const astroRunsByDagId = astroData?.runsByDagId || {};

  // Merges whatever account rows the caller passes in (CurrentClientsPage.jsx
  // narrows this to tracked Tier 1-3 accounts by default, or to search
  // matches, before calling in — see isTrackedTier in accountTier.js) — this
  // function itself no longer gates by tier.
  return (accounts || [])
    .map((a) => {
      const resolution = accountToClientId.get(a.Id);
      const clientId = resolution?.clientId || null;
      const h = clientId ? health.get(clientId) : null;
      const u = clientId ? usage.get(clientId) : null;
      const du = clientId ? distinctUsers.get(clientId) : null;
      const s = clientId ? support.get(clientId) : null;
      const cm = clientId ? commercial.get(clientId) : null;
      const matchName = (clientId && clientNameById.get(clientId)) || a.Name;
      const knownTags = TAGS_BY_ACCOUNT_ID.get(a.Id) || new Set();
      const freshdeskCompanyId = clientId ? freshdeskCompanyIdByClientId.get(clientId) : null;
      const externalTags = knownTagsForAccount(a.Id);

      const ticketsForAccount = matchFreshdeskTickets({
        tickets: freshdeskTickets, companies: freshdeskCompanies, freshdeskCompanyId, matchName, knownTags: externalTags,
      });
      const issuesForAccount = matchJiraIssues({ issues: jiraIssues, knownTags: externalTags, matchName });
      const dagsForAccount = matchAstroDags({
        dags: astroDags, runsByDagId: astroRunsByDagId, knownTags: externalTags, matchName,
      });

      return {
        Id: a.Id,
        Name: a.Name,
        Type: a.Type,
        AccountType_Tier__c: a.AccountType_Tier__c,
        Industry: a.Industry,
        SalesLead: a.Sales_Lead__r?.Name || null,
        Current_ARR__c: a.Current_ARR__c,
        ArrEndOfMonth: a.saasoptics__arr_at_end_of_month__c ?? null,
        // Account.LastActivityDate is a stale rollup in this org — prefer the
        // computed value (actual Task/Event max date, same source AccountView
        // uses) when available, falling back to the SF field otherwise.
        LastActivityDate: lastActivityByAccount?.get(a.Id) ?? a.LastActivityDate ?? null,
        OwnerId: a.OwnerId,
        OwnerName: a.Owner?.Name || null,
        BillingCity: a.BillingCity,
        BillingState: a.BillingState,
        OpenOppsCount: openOppCounts?.get(a.Id) || 0,

        HealthScore: h?.OVERALL_HEALTH_SCORE ?? null,
        HealthStatus: h?.HEALTH_STATUS ?? null,
        SupportScore: h?.SUPPORT_SCORE ?? null,
        UsageScore: h?.USAGE_SCORE ?? null,
        CommercialScore: h?.COMMERCIAL_SCORE ?? null,

        Website: a.Website ?? null,
        Phone: a.Phone ?? null,
        AnnualRevenue: a.AnnualRevenue ?? null,

        ApiCalls30d: u?.API_CALLS_30D ?? null,
        Forecasts30d: u?.FORECASTS_30D ?? null,
        ModelExecutions30d: u?.MODEL_EXECUTIONS_30D ?? null,
        ModelFailures30d: u?.MODEL_FAILURES_30D ?? null,
        ScenarioRuns30d: u?.SCENARIO_RUNS_30D ?? null,
        StressTests30d: u?.STRESS_TESTS_30D ?? null,
        ForecastLoans30d: u?.FORECAST_LOANS_30D ?? null,
        ForecastSecurities30d: u?.FORECAST_SECURITIES_30D ?? null,
        AvgLatencyMs30d: u?.AVG_LATENCY_MS_30D ?? null,
        DistinctUsers30d: du?.DISTINCT_USERS_30D ?? null,
        UserDistinctUsers30d: du?.USER_DISTINCT_USERS_30D ?? null,

        OpenTickets: s?.OPEN_TICKETS ?? null,
        EscalatedTickets: s?.ESCALATED_TICKETS ?? null,
        CriticalTickets: s?.CRITICAL_TICKETS ?? null,
        HighPriorityTickets: s?.HIGH_PRIORITY_TICKETS ?? null,
        AvgFirstResponseHours: s?.AVG_FIRST_RESPONSE_HOURS ?? null,
        AvgResolutionHours: s?.AVG_RESOLUTION_HOURS ?? null,

        SnowflakeARR: cm?.ARR ?? null,
        MRR: cm?.MRR ?? null,
        ContractValue: cm?.CONTRACT_VALUE ?? null,
        DaysToRenewal: cm?.DAYS_TO_RENEWAL ?? null,
        RenewalDateNearest: cm?.RENEWAL_DATE_NEAREST ?? null,
        ActiveContracts: cm?.ACTIVE_CONTRACTS ?? null,
        OpenInvoiceCount: cm?.OPEN_INVOICE_COUNT ?? null,
        OpenInvoiceAmount: cm?.OPEN_INVOICE_AMOUNT ?? null,

        ...aggregateDaas(knownTags, matchName, daasRows),
        ...aggregateBatch(knownTags, matchName, batchRows),
        ...aggregateFreshdesk(ticketsForAccount),
        ...aggregateJira(issuesForAccount),
        ...aggregateAstroLive(dagsForAccount),
        ...aggregateMaxio(maxioData || {}, a.Id, matchName),

        _snowflakeMatchStatus: resolution ? resolution.matchStatus : 'unmatched',
      };
    });
}
