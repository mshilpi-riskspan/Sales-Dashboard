import type { Env } from './types';
import { SnowflakeClient } from './snowflake';
import { syncSalesforce } from './sources/salesforce';
import { syncFreshdesk } from './sources/freshdesk';
import { syncJira } from './sources/jira';
import { syncMaxio } from './sources/maxio';
import { syncAstronomer } from './sources/astronomer';
import { syncCompanyMap } from './sources/companyMap';

async function run(env: Env): Promise<void> {
  const sf = new SnowflakeClient(env);

  // Run all source syncs in parallel, then rebuild company map
  const [salesforceResults, freshdeskResults, jiraResults, maxioResults, astronomerResults] = await Promise.allSettled([
    syncSalesforce(sf, env),
    syncFreshdesk(sf, env),
    syncJira(sf, env),
    syncMaxio(sf, env),
    syncAstronomer(sf, env),
  ]).then(settled => settled.map(r =>
    r.status === 'fulfilled' ? r.value : [{ source: 'unknown', table: 'unknown', upserted: 0, error: String((r as PromiseRejectedResult).reason) }]
  ));

  const allSourceResults = [...salesforceResults, ...freshdeskResults, ...jiraResults, ...maxioResults, ...astronomerResults];
  for (const r of allSourceResults) {
    if (r.error) console.error(`${r.source}/${r.table}: ERROR: ${r.error}`);
    else console.log(`${r.source}/${r.table}: ${r.upserted} upserted`);
  }

  // Company map runs after sources so it can see fresh data
  try {
    const mapResults = await syncCompanyMap(sf, env);
    for (const r of mapResults) {
      if (r.error) console.error(`${r.source}/${r.table}: ERROR: ${r.error}`);
      else console.log(`${r.source}/${r.table}: ${r.upserted} upserted`);
    }
  } catch (e) {
    console.error('companyMap failed:', e);
  }
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(run(env));
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/__run' && request.method === 'POST') {
      ctx.waitUntil(run(env));
      return new Response(JSON.stringify({ ok: true, message: 'Full ETL sync triggered' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true, worker: 'riskspan-dashboard-etl', schedule: '0 * * * *' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
