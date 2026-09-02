import { SnowflakeClient } from '../snowflake';
import { syncAstronomer } from '../sources/astronomer';
import { syncJira } from '../sources/jira';
import type { Env } from '../types';

async function run(env: Env): Promise<void> {
  const sf = new SnowflakeClient(env);
  const results = [
    ...await syncAstronomer(sf, env),
    ...await syncJira(sf, env),
  ];
  for (const r of results) {
    if (r.error) console.error(`${r.source}/${r.table}: ${r.error}`);
    else console.log(`${r.source}/${r.table}: ${r.upserted} upserted`);
  }
}

export default {
  async scheduled(_: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(run(env));
  },
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/__run' && request.method === 'POST') {
      ctx.waitUntil(run(env));
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true, worker: 'riskspan-etl-astronomer' }), { headers: { 'Content-Type': 'application/json' } });
  },
};
