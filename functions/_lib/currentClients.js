// Bulk, all-clients-at-once Snowflake query set for the Current Clients page
// — same tables and "latest snapshot" logic as functions/_lib/accountUsage.js's
// per-client QUERY_SET, but scoped to every client in one query each via
// QUALIFY ROW_NUMBER() OVER (PARTITION BY CLIENT_ID ...) instead of a
// WHERE CLIENT_ID='${id}' per call. No client-supplied SQL, ever — every
// statement below is fixed and server-authored, same as accountUsage.js.
//
// DaaS/RaaS and Airflow batch data isn't CLIENT_ID-linked upstream (fuzzy
// name-matched only, same caveat accountUsage.js already accepts) — pulled
// once, unfiltered, and matched client-side in JS against DIM_CLIENT names
// rather than issuing a JAROWINKLER_SIMILARITY call per client.
import { snowflakeQuery } from './snowflake.js';
import { rowsToObjects } from './snowflakeRows.js';

const BULK_QUERY_SET = {
  health: () => `SELECT CLIENT_ID, OVERALL_HEALTH_SCORE, HEALTH_STATUS, SUPPORT_SCORE, USAGE_SCORE, COMMERCIAL_SCORE
                  FROM CLIENT_HEALTH_SCORECARD
                  QUALIFY ROW_NUMBER() OVER (PARTITION BY CLIENT_ID ORDER BY SNAPSHOT_AT DESC) = 1`,

  usage: () => `SELECT CLIENT_ID,
      SUM(API_CALL_VOLUME) AS API_CALLS_30D,
      SUM(FORECAST_RUN_COUNT) AS FORECASTS_30D,
      SUM(MODEL_EXECUTIONS) AS MODEL_EXECUTIONS_30D,
      SUM(MODEL_FAILURES) AS MODEL_FAILURES_30D,
      SUM(SCENARIO_RUNS) AS SCENARIO_RUNS_30D,
      SUM(STRESS_TEST_RUNS) AS STRESS_TESTS_30D,
      SUM(FORECAST_LOAN_COUNT) AS FORECAST_LOANS_30D,
      SUM(FORECAST_SECURITY_COUNT) AS FORECAST_SECURITIES_30D,
      AVG(AVG_API_LATENCY_MS) AS AVG_LATENCY_MS_30D
    FROM FACT_USAGE_METRICS
    WHERE METRIC_DATE >= DATEADD('day',-30,CURRENT_DATE())
    GROUP BY CLIENT_ID`,

  // Bypasses the known-stale FACT_USAGE_METRICS.FORECAST_DISTINCT_USERS
  // column, same as accountUsage.js's distinctUsers builder — one join
  // covers every client at once via DIM_CLIENT.SNOWFLAKE_CLIENT_IDENTIFIER.
  distinctUsers: () => `SELECT dc.CLIENT_ID,
      COUNT(DISTINCT s.RS_USER_ID) AS DISTINCT_USERS_30D,
      COUNT(DISTINCT CASE WHEN LOWER(s.RS_USER_ID) NOT LIKE '%admin%' AND LOWER(s.RS_USER_ID) NOT LIKE '%support%' AND LOWER(s.RS_USER_ID) NOT LIKE '%batch%' THEN s.RS_USER_ID END) AS USER_DISTINCT_USERS_30D
    FROM EDGE.PUBLIC.RS_ANALYTICS_STATS_MASTER s
    JOIN DIM_CLIENT dc ON dc.SNOWFLAKE_CLIENT_IDENTIFIER = s.RS_COMPANY_ID
    WHERE s.RS_RUN_DATE::DATE >= DATEADD('day',-30,CURRENT_DATE())
    GROUP BY dc.CLIENT_ID`,

  support: () => `SELECT CLIENT_ID, OPEN_TICKETS, ESCALATED_TICKETS, CRITICAL_TICKETS, HIGH_PRIORITY_TICKETS,
                          AVG_FIRST_RESPONSE_HOURS, AVG_RESOLUTION_HOURS
                   FROM FACT_SUPPORT_METRICS
                   QUALIFY ROW_NUMBER() OVER (PARTITION BY CLIENT_ID ORDER BY METRIC_DATE DESC) = 1`,

  commercial: () => `SELECT CLIENT_ID, ARR, MRR, CONTRACT_VALUE, DAYS_TO_RENEWAL, RENEWAL_DATE_NEAREST,
                             ACTIVE_CONTRACTS, OPEN_INVOICE_COUNT, OPEN_INVOICE_AMOUNT
                      FROM FACT_COMMERCIAL_METRICS
                      QUALIFY ROW_NUMBER() OVER (PARTITION BY CLIENT_ID ORDER BY METRIC_DATE DESC) = 1`,

  // Flat list of every client's latest dataset rows (DaaS and RaaS both live
  // in this table, split by MODULE) — matched to a Salesforce Account by
  // fuzzy name comparison client-side, then aggregated per client.
  daas: () => `SELECT COMPANY_NAME, MODULE, DATASET_NAME, LOAN_COUNT, TOTAL_UPB, DQ_PCT, LATEST_DATE, HAS_DATA, ERROR
                FROM DAAS_DATASET_METRICS
                QUALIFY ROW_NUMBER() OVER (PARTITION BY COMPANY_NAME, MODULE, DATASET_NAME ORDER BY LATEST_DATE DESC) = 1`,

  // Every active DAG plus its latest run stats — matched to a client by
  // CLIENT_TAG/DAG_ID substring, same best-effort approach as accountUsage.js.
  batch: () => `SELECT d.DAG_ID, d.CLIENT_TAG, stats.TOTAL_RUNS, stats.SUCCESS_COUNT, stats.FAILED_COUNT, stats.LAST_RUN_STATE
                 FROM STG_AIRFLOW_DAGS d
                 LEFT JOIN (
                   SELECT DAG_ID, COUNT(*) AS TOTAL_RUNS,
                          SUM(CASE WHEN STATE = 'success' THEN 1 ELSE 0 END) AS SUCCESS_COUNT,
                          SUM(CASE WHEN STATE = 'failed' THEN 1 ELSE 0 END) AS FAILED_COUNT,
                          MAX_BY(STATE, START_DATE) AS LAST_RUN_STATE
                   FROM STG_AIRFLOW_DAG_RUNS GROUP BY DAG_ID
                 ) stats ON d.DAG_ID = stats.DAG_ID
                 WHERE d.IS_PAUSED = FALSE
                 QUALIFY ROW_NUMBER() OVER (PARTITION BY d.DAG_ID ORDER BY d._LOADED_AT DESC) = 1`,
};

export async function fetchCurrentClientsSnowflakeData(env) {
  const keys = Object.keys(BULK_QUERY_SET);
  const settled = await Promise.allSettled(
    keys.map((key) => snowflakeQuery(env, BULK_QUERY_SET[key]()))
  );

  const out = { failures: [] };
  keys.forEach((key, i) => {
    const result = settled[i];
    if (result.status === 'rejected') {
      out.failures.push(key);
      out[key] = [];
      return;
    }
    out[key] = rowsToObjects(result.value);
  });
  return out;
}
