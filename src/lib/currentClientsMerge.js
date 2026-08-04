// Merges Salesforce Account rows with bulk Snowflake client data into one
// flat row per current client, for the Current Clients page. Reuses the
// exact three-tier Account <-> DIM_CLIENT.CLIENT_ID resolution already in
// src/modules/settings/AccountMapping.jsx (direct SALESFORCE_ACCOUNT_ID FK,
// else a confirmed localStorage['snowflakeAccountMap'] override) — an
// unconfirmed fuzzy suggestion is NOT auto-applied here, same as
// AccountMapping.jsx requires an explicit human Accept before it counts.
import { isClientTier } from '../config/accountTier';
import { similarityScore } from './accountMatch';
import { CLIENT_TAG_TO_ACCOUNT_ID } from '../config/clientTagMap';

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

function normalizeForTagMatch(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function keyByClientId(rows) {
  const map = new Map();
  for (const row of rows) if (row.CLIENT_ID) map.set(row.CLIENT_ID, row);
  return map;
}

// DAAS_DATASET_METRICS.COMPANY_NAME is a short, manually-typed admin label
// (e.g. "PacLife"), not the client's full legal name — a bigram-similarity
// score against the raw Salesforce Account name alone misses it entirely
// ("Pacific Life Insurance Company" vs "PacLife" scores far below any sane
// threshold). accountUsage.js's per-client SQL avoids this by matching
// against DIM_CLIENT's curated DISPLAY_NAME with a bidirectional substring
// check before ever falling back to a similarity score — do the same here.
function looksLikeMatch(nameA, nameB, threshold = 0.5) {
  const a = (nameA || '').toLowerCase().trim();
  const b = (nameB || '').toLowerCase().trim();
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  return similarityScore(nameA, nameB) >= threshold;
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

export function mergeCurrentClients({ accounts, snowflakeClients, snowflakeData, openOppCounts }) {
  const overrideMap = loadOverrideMap();
  const accountsById = new Map((accounts || []).map((a) => [a.Id, a]));

  // accountId -> { clientId, matchStatus }, built the same way
  // AccountMapping.jsx's `rows` useMemo resolves Account<->CLIENT_ID, just
  // inverted to key by account instead of by Snowflake client.
  const accountToClientId = new Map();
  for (const c of (snowflakeClients || [])) {
    if (c.salesforceAccountId && accountsById.has(c.salesforceAccountId)) {
      accountToClientId.set(c.salesforceAccountId, { clientId: c.clientId, matchStatus: 'verified' });
    }
  }
  for (const [clientId, override] of Object.entries(overrideMap)) {
    if (override.status === 'confirmed' && override.salesforceAccountId && accountsById.has(override.salesforceAccountId)) {
      accountToClientId.set(override.salesforceAccountId, { clientId, matchStatus: 'confirmed' });
    }
  }

  // DIM_CLIENT.DISPLAY_NAME (falling back to CLIENT_NAME) is the curated name
  // that actually reconciles with DAAS_DATASET_METRICS/Airflow tags — use it
  // for fuzzy matching instead of the raw Salesforce Account name whenever a
  // CLIENT_ID has resolved.
  const clientNameById = new Map(
    (snowflakeClients || []).map((c) => [c.clientId, c.displayName || c.clientName])
  );

  const health = keyByClientId(snowflakeData?.health || []);
  const usage = keyByClientId(snowflakeData?.usage || []);
  const distinctUsers = keyByClientId(snowflakeData?.distinctUsers || []);
  const support = keyByClientId(snowflakeData?.support || []);
  const commercial = keyByClientId(snowflakeData?.commercial || []);
  const daasRows = snowflakeData?.daas || [];
  const batchRows = snowflakeData?.batch || [];

  return (accounts || [])
    .filter((a) => isClientTier(a.AccountType_Tier__c))
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

      return {
        Id: a.Id,
        Name: a.Name,
        AccountType_Tier__c: a.AccountType_Tier__c,
        Industry: a.Industry,
        SalesLead: a.Sales_Lead__r?.Name || null,
        Current_ARR__c: a.Current_ARR__c,
        LastActivityDate: a.LastActivityDate,
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

        ApiCalls30d: u?.API_CALLS_30D ?? null,
        Forecasts30d: u?.FORECASTS_30D ?? null,
        ModelExecutions30d: u?.MODEL_EXECUTIONS_30D ?? null,
        ModelFailures30d: u?.MODEL_FAILURES_30D ?? null,
        DistinctUsers30d: du?.DISTINCT_USERS_30D ?? null,

        OpenTickets: s?.OPEN_TICKETS ?? null,
        EscalatedTickets: s?.ESCALATED_TICKETS ?? null,
        CriticalTickets: s?.CRITICAL_TICKETS ?? null,
        AvgFirstResponseHours: s?.AVG_FIRST_RESPONSE_HOURS ?? null,

        SnowflakeARR: cm?.ARR ?? null,
        MRR: cm?.MRR ?? null,
        DaysToRenewal: cm?.DAYS_TO_RENEWAL ?? null,
        ActiveContracts: cm?.ACTIVE_CONTRACTS ?? null,
        OpenInvoiceCount: cm?.OPEN_INVOICE_COUNT ?? null,

        ...aggregateDaas(knownTags, matchName, daasRows),
        ...aggregateBatch(knownTags, matchName, batchRows),

        _snowflakeMatchStatus: resolution ? resolution.matchStatus : 'unmatched',
      };
    });
}
