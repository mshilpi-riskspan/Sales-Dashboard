// Shared "usage for one account" query set — imported by both the deployed
// Cloudflare Pages Function (functions/api/snowflake/account-usage.js) and
// the local Vite dev middleware (vite.config.js).
//
// Every identifier is validated against a strict format regex before it is
// ever interpolated into a SQL string (the Snowflake SQL API has no bind
// parameters — same constraint, same fix, as client-health-app/src/lib/
// queries.ts's safeClientId()). All queries run through snowflakeQuery(),
// which already enforces the read-only SELECT-only guard.
import { snowflakeQuery } from './snowflake.js';

const CLIENT_ID_RE = /^[a-f0-9]{32}$/i;
const SF_ID_RE = /^[a-zA-Z0-9]{15,18}$/;

// Snowflake's SQL API returns every value as a string; cast by declared
// column type so the client gets real numbers/booleans/dates instead of
// having to re-parse strings itself (same casting client-health-app's own
// connector applies to this same warehouse).
function castValue(raw, sfType) {
  if (raw === null || raw === undefined) return null;
  const t = (sfType || '').toLowerCase();
  if (['fixed', 'number', 'decimal', 'numeric', 'float', 'real', 'double'].includes(t)) {
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
  }
  if (t === 'boolean') return raw === 'true' || raw === '1';
  if (t === 'date') {
    const days = Number(raw);
    return Number.isInteger(days) ? new Date(days * 86400000).toISOString().slice(0, 10) : raw;
  }
  if (t === 'array' || t === 'object' || t === 'variant') {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

function rowsToObjects(result) {
  const cols = result?.resultSetMetaData?.rowType || [];
  return (result?.data || []).map((row) => {
    const obj = {};
    cols.forEach((c, i) => { obj[c.name] = castValue(row[i], c.type); });
    return obj;
  });
}

function firstRowObject(result) {
  return rowsToObjects(result)[0] || null;
}

async function resolveClientId(env, { clientId, accountId }) {
  if (clientId) {
    if (!CLIENT_ID_RE.test(clientId)) throw new Error('Invalid clientId format');
    return clientId;
  }
  if (accountId) {
    if (!SF_ID_RE.test(accountId)) throw new Error('Invalid accountId format');
    const result = await snowflakeQuery(
      env,
      `SELECT CLIENT_ID FROM DIM_CLIENT WHERE SALESFORCE_ACCOUNT_ID = '${accountId}'`
    );
    const row = firstRowObject(result);
    return row ? row.CLIENT_ID : null;
  }
  throw new Error('clientId or accountId is required');
}

// Keys whose result is a list of rows rather than a single summary row.
const LIST_KEYS = new Set(['contracts', 'usageByServer', 'usageTrend']);

// FACT_USAGE_METRICS.FORECAST_DISTINCT_USERS is known-stale in this warehouse
// (client-health-app bypasses it the same way) — distinct users is queried
// directly from the raw usage log instead, joined via SNOWFLAKE_CLIENT_IDENTIFIER.
const QUERY_SET = {
  health: (id) => `SELECT OVERALL_HEALTH_SCORE, HEALTH_STATUS, SUPPORT_SCORE, USAGE_SCORE, COMMERCIAL_SCORE, KEY_RISK_FACTORS
                    FROM CLIENT_HEALTH_SCORECARD WHERE CLIENT_ID='${id}' ORDER BY SNAPSHOT_AT DESC LIMIT 1`,

  // Full FACT_USAGE_METRICS surface, not just API calls/forecast runs —
  // model executions/failures, scenario & stress-test runs, premium feature
  // usage, overrides, and forecast loan/security counts all live in this
  // same table and were previously left unqueried.
  usage: (id) => `SELECT
      SUM(CASE WHEN METRIC_DATE >= DATEADD('day',-30,CURRENT_DATE()) THEN API_CALL_VOLUME ELSE 0 END) AS API_CALLS_30D,
      SUM(CASE WHEN METRIC_DATE >= DATEADD('day',-60,CURRENT_DATE()) AND METRIC_DATE < DATEADD('day',-30,CURRENT_DATE()) THEN API_CALL_VOLUME ELSE 0 END) AS API_CALLS_PREV_30D,
      SUM(CASE WHEN METRIC_DATE >= DATEADD('day',-30,CURRENT_DATE()) THEN FORECAST_RUN_COUNT ELSE 0 END) AS FORECASTS_30D,
      SUM(CASE WHEN METRIC_DATE >= DATEADD('day',-60,CURRENT_DATE()) AND METRIC_DATE < DATEADD('day',-30,CURRENT_DATE()) THEN FORECAST_RUN_COUNT ELSE 0 END) AS FORECASTS_PREV_30D,
      SUM(CASE WHEN METRIC_DATE >= DATEADD('day',-30,CURRENT_DATE()) THEN MODEL_EXECUTIONS ELSE 0 END) AS MODEL_EXECUTIONS_30D,
      SUM(CASE WHEN METRIC_DATE >= DATEADD('day',-30,CURRENT_DATE()) THEN MODEL_FAILURES ELSE 0 END) AS MODEL_FAILURES_30D,
      SUM(CASE WHEN METRIC_DATE >= DATEADD('day',-30,CURRENT_DATE()) THEN SCENARIO_RUNS ELSE 0 END) AS SCENARIO_RUNS_30D,
      SUM(CASE WHEN METRIC_DATE >= DATEADD('day',-30,CURRENT_DATE()) THEN STRESS_TEST_RUNS ELSE 0 END) AS STRESS_TESTS_30D,
      SUM(CASE WHEN METRIC_DATE >= DATEADD('day',-30,CURRENT_DATE()) THEN PREMIUM_FEATURE_USAGE_COUNT ELSE 0 END) AS PREMIUM_FEATURE_USAGE_30D,
      SUM(CASE WHEN METRIC_DATE >= DATEADD('day',-30,CURRENT_DATE()) THEN OVERRIDE_COUNT ELSE 0 END) AS OVERRIDES_30D,
      SUM(CASE WHEN METRIC_DATE >= DATEADD('day',-30,CURRENT_DATE()) THEN FORECAST_LOAN_COUNT ELSE 0 END) AS FORECAST_LOANS_30D,
      SUM(CASE WHEN METRIC_DATE >= DATEADD('day',-30,CURRENT_DATE()) THEN FORECAST_SECURITY_COUNT ELSE 0 END) AS FORECAST_SECURITIES_30D,
      AVG(CASE WHEN METRIC_DATE >= DATEADD('day',-30,CURRENT_DATE()) THEN AVG_API_LATENCY_MS END) AS AVG_LATENCY_MS_30D
    FROM FACT_USAGE_METRICS WHERE CLIENT_ID='${id}' AND METRIC_DATE >= DATEADD('day',-60,CURRENT_DATE())`,

  // Weekly trend over 90 days, for a small chart — same shape as
  // client-health's usage90d query in its client-summary popup.
  usageTrend: (id) => `SELECT DATE_TRUNC('week', METRIC_DATE)::DATE AS WEEK, SUM(API_CALL_VOLUME) AS QUERIES, SUM(FORECAST_RUN_COUNT) AS FORECASTS
                        FROM FACT_USAGE_METRICS WHERE CLIENT_ID='${id}' AND METRIC_DATE >= DATEADD('day',-90,CURRENT_DATE())
                        GROUP BY 1 ORDER BY 1`,

  // Per-server forecast run breakdown — client-health's usageServerQuery.
  usageByServer: (id) => `SELECT su.SERVER_NAME, SUM(su.QUERY_COUNT) AS RUN_COUNT
                           FROM STG_SNOWFLAKE_USAGE su
                           JOIN DIM_CLIENT dc ON dc.SNOWFLAKE_CLIENT_IDENTIFIER = su.CLIENT_IDENTIFIER
                           WHERE dc.CLIENT_ID='${id}' AND su.PRODUCT_TYPE='FORECASTING' AND su.SERVER_NAME IS NOT NULL
                             AND su.STAT_DATE >= DATEADD('day',-30,CURRENT_DATE())
                           GROUP BY su.SERVER_NAME ORDER BY RUN_COUNT DESC LIMIT 10`,

  // Distinct users, split end-user vs system/admin/batch — bypasses the
  // stale FACT_USAGE_METRICS.FORECAST_DISTINCT_USERS column, same as
  // client-health's usageQuery()/client-summary route.
  distinctUsers: (id) => `SELECT
      COUNT(DISTINCT RS_USER_ID) AS DISTINCT_USERS,
      COUNT(DISTINCT CASE WHEN LOWER(RS_USER_ID) NOT LIKE '%admin%' AND LOWER(RS_USER_ID) NOT LIKE '%support%' AND LOWER(RS_USER_ID) NOT LIKE '%batch%' THEN RS_USER_ID END) AS USER_DISTINCT_USERS,
      COUNT(DISTINCT CASE WHEN LOWER(RS_USER_ID) LIKE '%admin%' OR LOWER(RS_USER_ID) LIKE '%support%' OR LOWER(RS_USER_ID) LIKE '%batch%' THEN RS_USER_ID END) AS SYSTEM_DISTINCT_USERS,
      COUNT(CASE WHEN LOWER(RS_USER_ID) NOT LIKE '%admin%' AND LOWER(RS_USER_ID) NOT LIKE '%support%' AND LOWER(RS_USER_ID) NOT LIKE '%batch%' THEN 1 END) AS USER_RUNS,
      COUNT(CASE WHEN LOWER(RS_USER_ID) LIKE '%admin%' OR LOWER(RS_USER_ID) LIKE '%support%' OR LOWER(RS_USER_ID) LIKE '%batch%' THEN 1 END) AS SYSTEM_RUNS
    FROM EDGE.PUBLIC.RS_ANALYTICS_STATS_MASTER
    WHERE RS_RUN_DATE::DATE >= DATEADD('day',-30,CURRENT_DATE())
      AND RS_COMPANY_ID = (SELECT SNOWFLAKE_CLIENT_IDENTIFIER FROM DIM_CLIENT WHERE CLIENT_ID='${id}')`,

  support: (id) => `SELECT OPEN_TICKETS, NEW_TICKETS, RESOLVED_TICKETS, CLOSED_TICKETS, REOPENED_TICKETS,
                            ESCALATED_TICKETS, CRITICAL_TICKETS, HIGH_PRIORITY_TICKETS, AVG_FIRST_RESPONSE_HOURS, AVG_RESOLUTION_HOURS
                     FROM FACT_SUPPORT_METRICS WHERE CLIENT_ID='${id}' ORDER BY METRIC_DATE DESC LIMIT 1`,
  commercial: (id) => `SELECT ARR, MRR, CONTRACT_VALUE, DAYS_TO_RENEWAL, RENEWAL_DATE_NEAREST, ACTIVE_CONTRACTS,
                               OPEN_INVOICE_COUNT, OPEN_INVOICE_AMOUNT, EXPANSION_OPPORTUNITIES, EXPANSION_PIPELINE_VALUE
                        FROM FACT_COMMERCIAL_METRICS WHERE CLIENT_ID='${id}' ORDER BY METRIC_DATE DESC LIMIT 1`,
  contracts: (id) => `SELECT CONTRACT_NUMBER, EARLIEST_START_DATE, LATEST_END_DATE, TOTAL_CONTRACT_VALUE, IS_ACTIVE
                       FROM STG_MAXIO_CONTRACTS
                       WHERE CUSTOMER_ID=(SELECT MAXIO_CUSTOMER_ID FROM DIM_CLIENT WHERE CLIENT_ID='${id}')
                       ORDER BY LATEST_END_DATE DESC LIMIT 5`,
};

export async function fetchAccountUsage(env, params) {
  const clientId = await resolveClientId(env, params);
  if (!clientId) return { clientId: null, mapped: false, failures: [] };

  const keys = Object.keys(QUERY_SET);
  const settled = await Promise.allSettled(
    keys.map((key) => snowflakeQuery(env, QUERY_SET[key](clientId)))
  );

  const out = { clientId, mapped: true, failures: [] };
  keys.forEach((key, i) => {
    const result = settled[i];
    if (result.status === 'rejected') {
      out.failures.push(key);
      out[key] = LIST_KEYS.has(key) ? [] : null;
      return;
    }
    out[key] = LIST_KEYS.has(key) ? rowsToObjects(result.value) : firstRowObject(result.value);
  });
  return out;
}
