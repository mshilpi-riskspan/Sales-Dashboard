import type { Env, SyncResult } from './types';
import { SnowflakeClient } from './snowflake';
import { syncFreshdesk } from './sources/freshdesk';
import { syncJira } from './sources/jira';
import { syncMaxio } from './sources/maxio';
import { syncSalesforce } from './sources/salesforce';
import { syncAstronomer } from './sources/astronomer';
import { syncCompanyMap } from './sources/companyMap';

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runETL(env));
  },
};

async function runETL(env: Env): Promise<void> {
  const start = new Date().toISOString();
  console.log(`[${start}] ETL cycle starting`);

  const sf = new SnowflakeClient(env);
  const allResults: SyncResult[] = [];

  // Run all source syncs in parallel (independent of each other)
  const [fdResults, jiraResults, maxioResults, sfResults, astroResults] = await Promise.allSettled([
    syncFreshdesk(sf, env),
    syncJira(sf, env),
    syncMaxio(sf, env),
    syncSalesforce(sf, env),
    syncAstronomer(sf, env),
  ]);

  for (const r of [fdResults, jiraResults, maxioResults, sfResults, astroResults]) {
    if (r.status === 'fulfilled') {
      allResults.push(...r.value);
    } else {
      console.error('Source sync failed:', r.reason);
    }
  }

  // Company map runs after all sources are loaded
  try {
    const mapResults = await syncCompanyMap(sf, env);
    allResults.push(...mapResults);
  } catch (e) {
    console.error('Company map sync failed:', e);
  }

  const end = new Date().toISOString();
  const totalUpserted = allResults.reduce((s, r) => s + r.upserted, 0);
  const errors = allResults.filter(r => r.error);

  console.log(`[${end}] ETL cycle complete — ${totalUpserted} rows upserted across ${allResults.length} tables`);
  if (errors.length) {
    console.error(`Errors (${errors.length}):`);
    for (const e of errors) console.error(`  ${e.source}/${e.table}: ${e.error}`);
  }

  for (const r of allResults) {
    console.log(`  ${r.source}/${r.table}: ${r.upserted} upserted${r.error ? ` [ERROR: ${r.error}]` : ''}`);
  }
}
