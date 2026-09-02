import type { Env, SyncResult } from '../types';
import { JsonVariant } from '../snowflake';
import type { SnowflakeClient } from '../snowflake';

const PAGE_SIZE = 100;

async function fdGet(path: string, env: Env): Promise<unknown> {
  const domain = env.FRESHDESK_DOMAIN.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const url = `https://${domain}.freshdesk.com/api/v2${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${btoa(`${env.FRESHDESK_API_KEY}:X`)}` },
  });
  if (!res.ok) throw new Error(`Freshdesk ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchAllPages(basePath: string, env: Env, since?: string | null): Promise<unknown[]> {
  const items: unknown[] = [];
  let page = 1;
  while (true) {
    const sep = basePath.includes('?') ? '&' : '?';
    const dateFilter = since ? `&updated_since=${since}` : '';
    const data = await fdGet(`${basePath}${sep}page=${page}&per_page=${PAGE_SIZE}${dateFilter}`, env) as unknown[];
    items.push(...data);
    if (data.length < PAGE_SIZE) break;
    page++;
  }
  return items;
}

export async function syncFreshdesk(sf: SnowflakeClient, env: Env): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  const now = new Date().toISOString();

  // Companies
  try {
    const companies = await fetchAllPages('/companies', env) as Record<string, unknown>[];
    const rows = companies.map(c => [
      c.id as number,
      (c.name as string) ?? null,
      (c.description as string) ?? null,
      (c.note as string) ?? null,
      now,
    ]);
    const n = await sf.mergeRows('FD_COMPANIES', 'ID', ['ID', 'NAME', 'DESCRIPTION', 'NOTE', '_SYNCED_AT'], rows);
    results.push({ source: 'freshdesk', table: 'FD_COMPANIES', upserted: n });
  } catch (e) {
    results.push({ source: 'freshdesk', table: 'FD_COMPANIES', upserted: 0, error: String(e) });
  }

  // Tickets
  const watermarkKey = 'fd_tickets';
  let watermark: string | null = null;
  try {
    watermark = await sf.getWatermark(watermarkKey, env.ETL_KV);
    const tickets = await fetchAllPages('/tickets?include=company', env, watermark) as Record<string, unknown>[];
    const rows = tickets.map(t => [
      t.id as number,
      (t.company_id as number) ?? null,
      (t.subject as string) ?? null,
      (t.type as string) ?? null,
      t.status as number,
      t.priority as number,
      (t.is_escalated as boolean) ?? false,
      new JsonVariant(t.tags ?? []),
      t.created_at as string,
      t.updated_at as string,
      (t.first_responded_at as string) ?? null,
      now,
    ]);
    const n = await sf.mergeRows('FD_TICKETS', 'ID',
      ['ID', 'COMPANY_ID', 'SUBJECT', 'TYPE', 'STATUS', 'PRIORITY', 'IS_ESCALATED', 'TAGS', 'CREATED_AT', 'UPDATED_AT', 'FIRST_RESPONDED_AT', '_SYNCED_AT'],
      rows
    );
    await sf.setWatermark(watermarkKey, now, env.ETL_KV);
    results.push({ source: 'freshdesk', table: 'FD_TICKETS', upserted: n });

    // Conversations — skip on first run (no watermark) to avoid per-ticket subrequest explosion.
    // From run 2 onward, watermark limits tickets to recently-updated ones (small set).
    let convCount = 0;
    if (!watermark) {
      results.push({ source: 'freshdesk', table: 'FD_CONVERSATIONS', upserted: 0 });
    }
    for (const ticket of watermark ? tickets : []) {
      try {
        const convs = await fdGet(`/tickets/${ticket.id}/conversations`, env) as Record<string, unknown>[];
        const crows = convs.map(c => [
          c.id as number,
          ticket.id as number,
          (ticket.company_id as number) ?? null,
          ((c.body_text as string) ?? (c.body as string) ?? '').slice(0, 65000),
          (c.author_name as string) ?? null,
          (c.from_email as string) ?? null,
          (c.incoming as boolean) ?? false,
          (c.private as boolean) ?? false,
          c.created_at as string,
          c.updated_at as string,
          now,
        ]);
        convCount += await sf.mergeRows('FD_CONVERSATIONS', 'ID',
          ['ID', 'TICKET_ID', 'COMPANY_ID', 'BODY_TEXT', 'AUTHOR_NAME', 'FROM_EMAIL', 'INCOMING', 'PRIVATE', 'CREATED_AT', 'UPDATED_AT', '_SYNCED_AT'],
          crows
        );
      } catch { /* individual ticket conversation errors are non-fatal */ }
    }
    results.push({ source: 'freshdesk', table: 'FD_CONVERSATIONS', upserted: convCount });
  } catch (e) {
    results.push({ source: 'freshdesk', table: 'FD_TICKETS', upserted: 0, error: String(e) });
  }

  return results;
}
