import type { Env, SyncResult } from '../types';
import type { SnowflakeClient } from '../snowflake';

const PAGE_LIMIT = 100;

async function astroGet(path: string, env: Env): Promise<unknown> {
  const base = env.ASTRO_BASE_URL.replace(/\/$/, '');
  const res = await fetch(`${base}${path}`, {
    headers: {
      Authorization: `Bearer ${env.ASTRO_API_TOKEN}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Astronomer ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function syncAstronomer(sf: SnowflakeClient, env: Env): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  const now = new Date().toISOString();

  // DAGs
  try {
    const dags: Record<string, unknown>[] = [];
    let offset = 0;
    while (true) {
      const data = await astroGet(`/dags?limit=${PAGE_LIMIT}&offset=${offset}`, env) as { dags: Record<string, unknown>[]; total_entries: number };
      dags.push(...data.dags);
      offset += data.dags.length;
      if (offset >= data.total_entries) break;
    }

    const rows = dags.map(d => [
      d.dag_id as string,
      d.is_paused as boolean,
      d.has_import_errors as boolean,
      JSON.stringify(d.tags ?? []),
      (d.next_dagrun_data_interval_start as string) ?? (d.next_dagrun as string) ?? null,
      now,
    ]);
    const n = await sf.mergeRows('ASTRONOMER_DAGS', 'DAG_ID',
      ['DAG_ID', 'IS_PAUSED', 'HAS_IMPORT_ERRORS', 'TAGS', 'NEXT_DAGRUN_RUN_AFTER', '_SYNCED_AT'],
      rows
    );
    results.push({ source: 'astronomer', table: 'ASTRONOMER_DAGS', upserted: n });

    // DAG runs — last 200 runs per DAG (incremental by watermark)
    const watermark = await sf.getWatermark('astronomer_dag_runs', env.ETL_KV);
    let runCount = 0;
    for (const dag of dags) {
      try {
        const since = watermark ? `&start_date_gte=${watermark}` : '';
        const data = await astroGet(`/dags/${dag.dag_id}/dagRuns?limit=200&order_by=-start_date${since}`, env) as { dag_runs: Record<string, unknown>[] };
        const rrows = data.dag_runs.map(r => [
          dag.dag_id as string,
          (r.state as string) ?? null,
          (r.start_date as string) ?? null,
          (r.end_date as string) ?? null,
          (r.duration as number) ?? null,
          now,
        ]);
        if (rrows.length) {
          runCount += await sf.mergeRows('ASTRONOMER_DAG_RUNS', 'DAG_ID',
            ['DAG_ID', 'STATE', 'START_DATE', 'END_DATE', 'DURATION', '_SYNCED_AT'],
            rrows
          );
        }
      } catch { /* non-fatal per-dag */ }
    }
    await sf.setWatermark('astronomer_dag_runs', now, env.ETL_KV);
    results.push({ source: 'astronomer', table: 'ASTRONOMER_DAG_RUNS', upserted: runCount });
  } catch (e) {
    results.push({ source: 'astronomer', table: 'ASTRONOMER_DAGS', upserted: 0, error: String(e) });
  }

  return results;
}
