// Astronomer (managed Airflow) connector — live DAG list + per-DAG recent
// run history. Supplements (does not replace) the existing Snowflake-sourced
// STG_AIRFLOW_DAGS/STG_AIRFLOW_DAG_RUNS batch data already used elsewhere in
// this app: that source has cheap historical aggregates (total runs, success
// rate over all time) an ETL job maintains; this source answers a different
// question — "is this DAG healthy right now" — without waiting on that ETL.
//
// Auth: Bearer token.

const REQUIRED_ENV_VARS = ['ASTRO_API_TOKEN', 'ASTRO_BASE_URL'];

function assertConfigured(env) {
  const missing = REQUIRED_ENV_VARS.filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(`Missing Astronomer env var(s): ${missing.join(', ')}`);
  }
}

function authHeader(env) {
  return `Bearer ${env.ASTRO_API_TOKEN}`;
}

async function astroFetch(env, path) {
  const res = await fetch(`${env.ASTRO_BASE_URL}${path}`, {
    headers: { Authorization: authHeader(env), 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Astronomer request failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchDags(env) {
  const PAGE = 100;
  const first = await astroFetch(env, `/dags?limit=${PAGE}&offset=0`);
  const allDags = [...(first.dags || [])];
  const total = first.total_entries ?? first.totalEntries ?? allDags.length;
  let offset = PAGE;
  while (offset < total) {
    const page = await astroFetch(env, `/dags?limit=${PAGE}&offset=${offset}`);
    const batch = page.dags || [];
    allDags.push(...batch);
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  return allDags;
}

// Airflow 3's Astro API may key run results as `dag_runs` or `items`
// depending on version — read both defensively.
async function fetchDagRuns(env, dagId) {
  const result = await astroFetch(env, `/dags/${encodeURIComponent(dagId)}/dagRuns?limit=90&order_by=-start_date`);
  return result.dag_runs || result.items || [];
}

export async function fetchAstronomerData(env) {
  assertConfigured(env);

  let dags;
  try {
    dags = await fetchDags(env);
  } catch (err) {
    return { dags: [], runsByDagId: {}, failures: ['dags'], error: err.message };
  }

  const unpaused = dags.filter((d) => !d.is_paused);
  const settled = await Promise.allSettled(unpaused.map((d) => fetchDagRuns(env, d.dag_id)));

  const runsByDagId = {};
  const failures = [];
  unpaused.forEach((d, i) => {
    if (settled[i].status === 'fulfilled') {
      runsByDagId[d.dag_id] = settled[i].value;
    } else {
      runsByDagId[d.dag_id] = [];
      failures.push(`runs:${d.dag_id}`);
    }
  });

  return { dags, runsByDagId, failures };
}
