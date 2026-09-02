import type { Env } from './types';
import { SnowflakeClient } from './snowflake';
import { syncCompanyMap } from './sources/companyMap';

// This worker only rebuilds COMPANY_MAP — runs at :50 after all source workers (:32–:44) finish.
// Source syncs live in separate workers: wrangler.salesforce/freshdesk/jira/maxio/astronomer.toml

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCompanyMap(env));
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/__run' && request.method === 'POST') {
      ctx.waitUntil(runCompanyMap(env));
      return new Response(JSON.stringify({ ok: true, message: 'Company map sync triggered' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true, worker: 'riskspan-dashboard-etl', schedule: '50 * * * *' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};

async function runCompanyMap(env: Env): Promise<void> {
  const sf = new SnowflakeClient(env);
  try {
    const results = await syncCompanyMap(sf, env);
    for (const r of results) {
      console.log(`${r.source}/${r.table}: ${r.upserted} upserted${r.error ? ` [ERROR: ${r.error}]` : ''}`);
    }
  } catch (e) {
    console.error('Company map sync failed:', e);
  }
}
