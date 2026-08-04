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
import { rowsToObjects, firstRowObject } from './snowflakeRows.js';

const CLIENT_ID_RE = /^[a-f0-9]{32}$/i;
const SF_ID_RE = /^[a-zA-Z0-9]{15,18}$/;

// Escapes single quotes for a SQL string literal (Snowflake's SQL API has no
// bind parameters). Only used on names already looked up from DIM_CLIENT
// itself, never on raw client input.
function sqlEsc(s) {
  return (s || '').replace(/'/g, "''");
}

// Alnum-only lowercase, for the loose CLIENT_TAG/company-name matching that
// client-health-app itself uses for Airflow DAG and DaaS/RaaS dataset joins
// (neither is linked to DIM_CLIENT.CLIENT_ID directly upstream).
function normalizeForTagMatch(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Some CLIENT_NAME/DISPLAY_NAME values are stored HTML-entity-encoded (e.g.
// "Alvarez &amp; Marsal") — decode before use so the literal ";" doesn't trip
// the read-only connector's statement-stacking guard when embedded in a SQL
// string literal, and so name matching isn't silently broken by it either.
function decodeHtmlEntities(s) {
  if (!s) return s;
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// Resolves CLIENT_ID plus the client's name/display name in one lookup —
// the name is needed for the fuzzy-matched Airflow/DaaS+RaaS queries below.
async function resolveClientContext(env, { clientId, accountId }) {
  if (clientId) {
    if (!CLIENT_ID_RE.test(clientId)) throw new Error('Invalid clientId format');
    const result = await snowflakeQuery(
      env,
      `SELECT CLIENT_NAME, DISPLAY_NAME FROM DIM_CLIENT WHERE CLIENT_ID='${clientId}'`
    );
    const row = firstRowObject(result);
    return {
      id: clientId,
      name: decodeHtmlEntities(row?.CLIENT_NAME) || null,
      display: decodeHtmlEntities(row?.DISPLAY_NAME) || null,
    };
  }
  if (accountId) {
    if (!SF_ID_RE.test(accountId)) throw new Error('Invalid accountId format');
    const result = await snowflakeQuery(
      env,
      `SELECT CLIENT_ID, CLIENT_NAME, DISPLAY_NAME FROM DIM_CLIENT WHERE SALESFORCE_ACCOUNT_ID = '${accountId}'`
    );
    const row = firstRowObject(result);
    if (!row) return { id: null, name: null, display: null };
    return {
      id: row.CLIENT_ID,
      name: decodeHtmlEntities(row.CLIENT_NAME) || null,
      display: decodeHtmlEntities(row.DISPLAY_NAME) || null,
    };
  }
  throw new Error('clientId or accountId is required');
}

// Keys whose result is a list of rows rather than a single summary row.
const LIST_KEYS = new Set(['contracts', 'usageByServer', 'usageTrend', 'datasets', 'batch']);

// FACT_USAGE_METRICS.FORECAST_DISTINCT_USERS is known-stale in this warehouse
// (client-health-app bypasses it the same way) — distinct users is queried
// directly from the raw usage log instead, joined via SNOWFLAKE_CLIENT_IDENTIFIER.
// Every builder takes the resolved { id, name, display } context, even the
// ones that only need `id` — keeps the fan-out loop below uniform.
const QUERY_SET = {
  health: ({ id }) => `SELECT OVERALL_HEALTH_SCORE, HEALTH_STATUS, SUPPORT_SCORE, USAGE_SCORE, COMMERCIAL_SCORE, KEY_RISK_FACTORS
                    FROM CLIENT_HEALTH_SCORECARD WHERE CLIENT_ID='${id}' ORDER BY SNAPSHOT_AT DESC LIMIT 1`,

  // Full FACT_USAGE_METRICS surface, not just API calls/forecast runs —
  // model executions/failures, scenario & stress-test runs, premium feature
  // usage, overrides, and forecast loan/security counts all live in this
  // same table and were previously left unqueried.
  usage: ({ id }) => `SELECT
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
  usageTrend: ({ id }) => `SELECT DATE_TRUNC('week', METRIC_DATE)::DATE AS WEEK, SUM(API_CALL_VOLUME) AS QUERIES, SUM(FORECAST_RUN_COUNT) AS FORECASTS
                        FROM FACT_USAGE_METRICS WHERE CLIENT_ID='${id}' AND METRIC_DATE >= DATEADD('day',-90,CURRENT_DATE())
                        GROUP BY 1 ORDER BY 1`,

  // Per-server forecast run breakdown — client-health's usageServerQuery.
  usageByServer: ({ id }) => `SELECT su.SERVER_NAME, SUM(su.QUERY_COUNT) AS RUN_COUNT
                           FROM STG_SNOWFLAKE_USAGE su
                           JOIN DIM_CLIENT dc ON dc.SNOWFLAKE_CLIENT_IDENTIFIER = su.CLIENT_IDENTIFIER
                           WHERE dc.CLIENT_ID='${id}' AND su.PRODUCT_TYPE='FORECASTING' AND su.SERVER_NAME IS NOT NULL
                             AND su.STAT_DATE >= DATEADD('day',-30,CURRENT_DATE())
                           GROUP BY su.SERVER_NAME ORDER BY RUN_COUNT DESC LIMIT 10`,

  // Distinct users, split end-user vs system/admin/batch — bypasses the
  // stale FACT_USAGE_METRICS.FORECAST_DISTINCT_USERS column, same as
  // client-health's usageQuery()/client-summary route.
  distinctUsers: ({ id }) => `SELECT
      COUNT(DISTINCT RS_USER_ID) AS DISTINCT_USERS,
      COUNT(DISTINCT CASE WHEN LOWER(RS_USER_ID) NOT LIKE '%admin%' AND LOWER(RS_USER_ID) NOT LIKE '%support%' AND LOWER(RS_USER_ID) NOT LIKE '%batch%' THEN RS_USER_ID END) AS USER_DISTINCT_USERS,
      COUNT(DISTINCT CASE WHEN LOWER(RS_USER_ID) LIKE '%admin%' OR LOWER(RS_USER_ID) LIKE '%support%' OR LOWER(RS_USER_ID) LIKE '%batch%' THEN RS_USER_ID END) AS SYSTEM_DISTINCT_USERS,
      COUNT(CASE WHEN LOWER(RS_USER_ID) NOT LIKE '%admin%' AND LOWER(RS_USER_ID) NOT LIKE '%support%' AND LOWER(RS_USER_ID) NOT LIKE '%batch%' THEN 1 END) AS USER_RUNS,
      COUNT(CASE WHEN LOWER(RS_USER_ID) LIKE '%admin%' OR LOWER(RS_USER_ID) LIKE '%support%' OR LOWER(RS_USER_ID) LIKE '%batch%' THEN 1 END) AS SYSTEM_RUNS
    FROM EDGE.PUBLIC.RS_ANALYTICS_STATS_MASTER
    WHERE RS_RUN_DATE::DATE >= DATEADD('day',-30,CURRENT_DATE())
      AND RS_COMPANY_ID = (SELECT SNOWFLAKE_CLIENT_IDENTIFIER FROM DIM_CLIENT WHERE CLIENT_ID='${id}')`,

  support: ({ id }) => `SELECT OPEN_TICKETS, NEW_TICKETS, RESOLVED_TICKETS, CLOSED_TICKETS, REOPENED_TICKETS,
                            ESCALATED_TICKETS, CRITICAL_TICKETS, HIGH_PRIORITY_TICKETS, AVG_FIRST_RESPONSE_HOURS, AVG_RESOLUTION_HOURS
                     FROM FACT_SUPPORT_METRICS WHERE CLIENT_ID='${id}' ORDER BY METRIC_DATE DESC LIMIT 1`,
  commercial: ({ id }) => `SELECT ARR, MRR, CONTRACT_VALUE, DAYS_TO_RENEWAL, RENEWAL_DATE_NEAREST, ACTIVE_CONTRACTS,
                               OPEN_INVOICE_COUNT, OPEN_INVOICE_AMOUNT, EXPANSION_OPPORTUNITIES, EXPANSION_PIPELINE_VALUE
                        FROM FACT_COMMERCIAL_METRICS WHERE CLIENT_ID='${id}' ORDER BY METRIC_DATE DESC LIMIT 1`,
  contracts: ({ id }) => `SELECT CONTRACT_NUMBER, EARLIEST_START_DATE, LATEST_END_DATE, TOTAL_CONTRACT_VALUE, IS_ACTIVE
                       FROM STG_MAXIO_CONTRACTS
                       WHERE CUSTOMER_ID=(SELECT MAXIO_CUSTOMER_ID FROM DIM_CLIENT WHERE CLIENT_ID='${id}')
                       ORDER BY LATEST_END_DATE DESC LIMIT 5`,

  // DaaS + RaaS dataset freshness/health — DAAS_DATASET_METRICS.MODULE holds
  // both ('DaaS' and 'RaaS' are both valid values per client-health-app's own
  // dataset-admin page), so grouping by MODULE surfaces both product lines
  // from the one table. Not linked to DIM_CLIENT.CLIENT_ID upstream — matched
  // by company name the same (imperfect, best-effort) way client-health-app
  // itself matches it, including its JAROWINKLER_SIMILARITY fallback.
  datasets: ({ name, display }) => {
    const n = sqlEsc(display || name || '');
    if (!n) return null;
    // Individual dataset rows, not collapsed by MODULE — a client can have
    // several distinct datasets (different DATASET_NAME) per module, each
    // with its own freshness/DQ/error state worth seeing separately.
    return `SELECT MODULE, DATASET_NAME, LOAN_COUNT, LOAN_COUNT_DELTA, TOTAL_UPB, UPB_DELTA,
                   DQ_COUNT, DQ_PCT, DQ_PCT_DELTA, LATEST_DATE, LAST_UPDATED, HAS_DATA, ERROR
            FROM DAAS_DATASET_METRICS
            WHERE (LOWER(COMPANY_NAME) = LOWER('${n}')
                   OR LOWER('${n}') LIKE '%' || LOWER(COMPANY_NAME) || '%'
                   OR LOWER(COMPANY_NAME) LIKE '%' || LOWER('${n}') || '%'
                   OR JAROWINKLER_SIMILARITY(LOWER(COMPANY_NAME), LOWER('${n}')) > 92)
            ORDER BY MODULE, DATASET_NAME LIMIT 20`;
  },

  // Airflow/batch pipeline health — STG_AIRFLOW_DAGS/STG_AIRFLOW_DAG_RUNS,
  // matched by CLIENT_TAG contains-name (client-health-app's own /api/
  // clients/[id]/route.ts "batch" tab query, copied as-is). Best-effort by
  // design — DAGs are tagged, not DIM_CLIENT-linked.
  batch: ({ name, display }) => {
    // Build the WHERE clause only from whichever of name/display actually
    // normalized to something non-empty — an unconditional `LIKE '%%'` from
    // an empty value would match every DAG (a real bug caught in testing:
    // short/single-name clients pulled in totally unrelated DAGs).
    const n = normalizeForTagMatch(name);
    const d = normalizeForTagMatch(display);
    const tags = [...new Set([n, d].filter(Boolean))];
    if (tags.length === 0) return null;
    const clauses = tags.flatMap((t) => [
      `LOWER(REPLACE(d.CLIENT_TAG, '_', '')) LIKE '%${t}%'`,
      `LOWER(d.DAG_ID) LIKE '%${t}%'`,
    ]);
    return `SELECT d.DAG_ID, d.CLIENT_TAG, d.DESCRIPTION, d.SCHEDULE_DESCRIPTION, d.NEXT_RUN_AFTER,
                   stats.TOTAL_RUNS, stats.SUCCESS_COUNT, stats.FAILED_COUNT, stats.AVG_DURATION_SECONDS,
                   stats.LAST_RUN_STATE, stats.LAST_RUN_DATE
            FROM STG_AIRFLOW_DAGS d
            LEFT JOIN (
              SELECT DAG_ID, COUNT(*) AS TOTAL_RUNS,
                     SUM(CASE WHEN STATE = 'success' THEN 1 ELSE 0 END) AS SUCCESS_COUNT,
                     SUM(CASE WHEN STATE = 'failed' THEN 1 ELSE 0 END) AS FAILED_COUNT,
                     ROUND(AVG(DURATION_SECONDS), 1) AS AVG_DURATION_SECONDS,
                     MAX_BY(STATE, START_DATE) AS LAST_RUN_STATE,
                     MAX(END_DATE) AS LAST_RUN_DATE
              FROM STG_AIRFLOW_DAG_RUNS GROUP BY DAG_ID
            ) stats ON d.DAG_ID = stats.DAG_ID
            WHERE d.IS_PAUSED = FALSE AND (${clauses.join(' OR ')})
            QUALIFY ROW_NUMBER() OVER (PARTITION BY d.DAG_ID ORDER BY d._LOADED_AT DESC) = 1
            ORDER BY d.DAG_ID LIMIT 10`;
  },
};

export async function fetchAccountUsage(env, params) {
  const ctx = await resolveClientContext(env, params);
  if (!ctx.id) return { clientId: null, mapped: false, failures: [] };

  const keys = Object.keys(QUERY_SET);
  const settled = await Promise.allSettled(
    keys.map((key) => {
      const sql = QUERY_SET[key](ctx);
      // A builder returns null when it has nothing to match on (e.g. no
      // client name resolved) — treat as "nothing to fetch" rather than
      // sending a query that would fail anyway.
      return sql ? snowflakeQuery(env, sql) : Promise.resolve(null);
    })
  );

  const out = { clientId: ctx.id, mapped: true, failures: [] };
  keys.forEach((key, i) => {
    const result = settled[i];
    if (result.status === 'rejected') {
      out.failures.push(key);
      out[key] = LIST_KEYS.has(key) ? [] : null;
      return;
    }
    if (result.value === null) {
      out[key] = LIST_KEYS.has(key) ? [] : null;
      return;
    }
    out[key] = LIST_KEYS.has(key) ? rowsToObjects(result.value) : firstRowObject(result.value);
  });
  return out;
}
