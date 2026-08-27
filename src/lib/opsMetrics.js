import { CLIENT_TAG_TO_ACCOUNT_ID } from '../config/clientTagMap';

// Tags that are product/infra descriptors, never client identifiers.
const NON_CLIENT_TAGS = new Set([
  'raas', 'daas_api_triggered', 'live', 'live_dag', 'utility', 'monitoring',
  'Monitoring', 'Airflow REST API', 'listener', 'ftp', 'dev', 'cron', 'test',
  'poc', 'ai', 'pod', 'cleanup', 'eks', 'infra', 'regression_testing', 'testing',
  'aggregation', 's3', 'master', 'monthly', 'pricing', 'custom_security',
  'add_sec_pricing', 'add_sec_rml', 'book_yield', 'cf', 'ebo', 'indics',
  'marketcolor', 'nonqm', 'precache', 'rml', 'static_assumptions',
]);

export const PRODUCT_FILTERS = {
  raas: (d) =>
    d.tags?.some((t) => t.name === 'raas') &&
    !d.tags?.some((t) => t.name === 'daas_api_triggered'),
  daas: (d) => d.tags?.some((t) => t.name === 'daas_api_triggered'),
  all: () => true,
};

// Returns the SF account ID for a DAG if the client tag is in the map.
function getClientAccountId(dag) {
  for (const t of dag.tags || []) {
    const upper = t.name?.toUpperCase();
    if (upper && !NON_CLIENT_TAGS.has(t.name) && CLIENT_TAG_TO_ACCOUNT_ID[upper]) {
      return CLIENT_TAG_TO_ACCOUNT_ID[upper];
    }
  }
  return null;
}

// Returns the first non-infrastructure tag, regardless of SF mapping.
function getClientTag(dag) {
  for (const t of dag.tags || []) {
    if (t.name && !NON_CLIENT_TAGS.has(t.name)) return t.name;
  }
  return null;
}

// Returns one row per client with aggregated run stats.
// Groups by SF account ID when mapped; falls back to the raw tag name so
// unmapped companies still appear rather than being silently dropped.
export function buildClientRows({ dags, runsByDagId, productTag, accountsById }) {
  const filterFn = PRODUCT_FILTERS[productTag] ?? PRODUCT_FILTERS.all;

  const productDags = dags.filter((d) => !d.is_paused).filter(filterFn);

  const byKey = new Map();
  for (const dag of productDags) {
    const accountId = getClientAccountId(dag);
    const clientTag = getClientTag(dag);
    const key = accountId ?? clientTag;
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, { accountId, clientTag, dags: [] });
    byKey.get(key).dags.push({
      ...dag,
      runs: runsByDagId?.[dag.dag_id] || [],
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const rows = [];
  for (const [, { accountId, clientTag, dags: clientDags }] of byKey) {
    const acct = accountId ? accountsById?.get(accountId) : null;
    const allRuns = clientDags
      .flatMap((d) => d.runs)
      .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''));
    rows.push({
      accountId: accountId ?? null,
      accountName: acct?.Name ?? clientTag,
      tier: acct?.AccountType_Tier__c ?? null,
      dagCount: clientDags.length,
      dags: clientDags,
      ...computeRunStats(allRuns, today),
    });
  }
  return rows;
}

function dateOf(run) {
  return (run.start_date || '').slice(0, 10);
}

function daysBefore(today, n) {
  const d = new Date(today + 'T00:00:00');
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function healthPct(success, failed) {
  const total = success + failed;
  return total > 0 ? Math.round((success / total) * 100) : null;
}

export function computeRunStats(runs, today) {
  const w0Start = daysBefore(today, 6);   // this week (last 7 days incl today)
  const w1Start = daysBefore(today, 13);  // prev week
  const m0Start = daysBefore(today, 29);  // this month (last 30 days)
  const m1Start = daysBefore(today, 59);  // prev month

  let todaySuccess = 0, todayFailed = 0;
  let w0s = 0, w0f = 0, w1s = 0, w1f = 0;
  let m0s = 0, m0f = 0, m1s = 0, m1f = 0;

  const last = runs[0] ?? null;

  for (const r of runs) {
    const d = dateOf(r);
    const s = r.state === 'success';
    const f = r.state === 'failed';
    if (d === today)              { if (s) todaySuccess++; if (f) todayFailed++; }
    if (d >= w0Start && d <= today) { if (s) w0s++; if (f) w0f++; }
    if (d >= w1Start && d < w0Start) { if (s) w1s++; if (f) w1f++; }
    if (d >= m0Start && d <= today) { if (s) m0s++; if (f) m0f++; }
    if (d >= m1Start && d < m0Start) { if (s) m1s++; if (f) m1f++; }
  }

  const hp7  = healthPct(w0s, w0f);
  const hp7p = healthPct(w1s, w1f);
  const hp30 = healthPct(m0s, m0f);
  const hp30p = healthPct(m1s, m1f);

  return {
    lastRunState:    last?.state ?? null,
    lastRunDate:     last ? dateOf(last) : null,
    lastRunDuration: last?.duration ?? null,
    todaySuccess,
    todayFailed,
    healthPct7d:     hp7,
    healthPct30d:    hp30,
    wowDelta:        hp7 != null && hp7p != null ? hp7 - hp7p : null,
    momDelta:        hp30 != null && hp30p != null ? hp30 - hp30p : null,
    dailySeries:     buildDailySeries(runs, today, 30),
  };
}

export function buildDailySeries(runs, today, days = 30) {
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = daysBefore(today, i);
    const dayRuns = runs.filter((r) => dateOf(r) === date);
    series.push({
      date,
      success: dayRuns.filter((r) => r.state === 'success').length,
      failed:  dayRuns.filter((r) => r.state === 'failed').length,
    });
  }
  return series;
}

// Merge per-client daily series into a single aggregate series.
export function mergeDailySeries(clientRows) {
  if (!clientRows.length) return [];
  const merged = new Map();
  for (const row of clientRows) {
    for (const pt of row.dailySeries || []) {
      const existing = merged.get(pt.date) ?? { date: pt.date, success: 0, failed: 0 };
      existing.success += pt.success;
      existing.failed  += pt.failed;
      merged.set(pt.date, existing);
    }
  }
  return Array.from(merged.values()).sort((a, b) => a.date.localeCompare(b.date));
}
