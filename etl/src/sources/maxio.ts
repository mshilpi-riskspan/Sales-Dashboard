import type { Env, SyncResult } from '../types';
import type { SnowflakeClient } from '../snowflake';

const PAGE_SIZE = 200;

async function maxioGet(path: string, env: Env): Promise<unknown> {
  const base = env.MAXIO_BASE_URL.replace(/\/$/, '');
  const res = await fetch(`${base}${path}`, {
    headers: {
      Authorization: `Basic ${btoa(`${env.MAXIO_API_TOKEN}:X`)}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Maxio ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchPages<T>(basePath: string, key: string, env: Env): Promise<T[]> {
  const items: T[] = [];
  let page = 1;
  while (true) {
    const sep = basePath.includes('?') ? '&' : '?';
    const data = await maxioGet(`${basePath}${sep}page=${page}&per_page=${PAGE_SIZE}`, env) as T[];
    if (!Array.isArray(data) || data.length === 0) break;
    const unwrapped = data.map((item: unknown) => {
      const rec = item as Record<string, unknown>;
      return (rec[key] ?? item) as T;
    });
    items.push(...unwrapped);
    if (data.length < PAGE_SIZE) break;
    page++;
  }
  return items;
}

export async function syncMaxio(sf: SnowflakeClient, env: Env): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  const now = new Date().toISOString();

  // Customers
  try {
    const customers = await fetchPages<Record<string, unknown>>('/customers.json', 'customer', env);
    const rows = customers.map(c => [
      c.id as number,
      (c.sf_id as string) ?? null,
      (c.first_name as string ?? '') + ' ' + (c.last_name as string ?? ''),
      (c.organization as string) ?? null,
      now,
    ]);
    const n = await sf.mergeRows('MAXIO_CUSTOMERS', 'ID',
      ['ID', 'SF_ACCOUNT_ID', 'NAME', 'COMPANY_NAME', '_SYNCED_AT'],
      rows
    );
    results.push({ source: 'maxio', table: 'MAXIO_CUSTOMERS', upserted: n });
  } catch (e) {
    results.push({ source: 'maxio', table: 'MAXIO_CUSTOMERS', upserted: 0, error: String(e) });
  }

  // Products/Items
  try {
    const products = await fetchPages<Record<string, unknown>>('/products.json', 'product', env);
    const rows = products.map(p => [p.id as number, (p.name as string) ?? null, now]);
    const n = await sf.mergeRows('MAXIO_ITEMS', 'ID', ['ID', 'NAME', '_SYNCED_AT'], rows);
    results.push({ source: 'maxio', table: 'MAXIO_ITEMS', upserted: n });
  } catch (e) {
    results.push({ source: 'maxio', table: 'MAXIO_ITEMS', upserted: 0, error: String(e) });
  }

  // Subscriptions (contracts)
  try {
    const watermark = await sf.getWatermark('maxio_contracts', env.ETL_KV);
    const since = watermark ? `&date_field=updated_at&start_date=${watermark.slice(0, 10)}` : '';
    const subs = await fetchPages<Record<string, unknown>>(`/subscriptions.json?include[]=components${since}`, 'subscription', env);
    const contractRows = subs.map(s => [s.id as number, (s.customer as Record<string, unknown>)?.id as number ?? null, now]);
    const nc = await sf.mergeRows('MAXIO_CONTRACTS', 'ID', ['ID', 'CUSTOMER_ID', '_SYNCED_AT'], contractRows);
    results.push({ source: 'maxio', table: 'MAXIO_CONTRACTS', upserted: nc });

    // Transactions / line items
    const txRows: (string | number | boolean | null)[][] = [];
    for (const sub of subs) {
      try {
        const txs = await maxioGet(`/subscriptions/${sub.id}/transactions.json?kinds[]=payment&kinds[]=charge&per_page=200`, env) as Record<string, unknown>[];
        for (const tx of txs) {
          const t = (tx.transaction ?? tx) as Record<string, unknown>;
          txRows.push([
            t.id as number,
            sub.id as number,
            (sub.customer as Record<string, unknown>)?.id as number ?? null,
            (t.product_id as number) ?? null,
            (t.memo as string)?.slice(0, 500) ?? null,
            null, // HOME_ARR_AMOUNT — not available per-tx, populated via line items
            (t.amount_in_cents as number) ? (t.amount_in_cents as number) / 100 : null,
            (t.created_at as string)?.slice(0, 10) ?? null,
            null,
            false,
            false,
            (sub.state as string) === 'active',
            (t.memo as string)?.slice(0, 500) ?? null,
            now,
          ]);
        }
      } catch { /* non-fatal per-subscription */ }
    }
    if (txRows.length) {
      const nt = await sf.mergeRows('MAXIO_TRANSACTIONS', 'ID',
        ['ID', 'CONTRACT_ID', 'CUSTOMER_ID', 'ITEM_ID', 'ITEM_NAME', 'HOME_ARR_AMOUNT', 'HOME_AMOUNT', 'START_DATE', 'END_DATE', 'CANCELLED', 'IS_AUTORENEWAL', 'IS_ACTIVE', 'INVOICE_DESCRIPTION', '_SYNCED_AT'],
        txRows
      );
      results.push({ source: 'maxio', table: 'MAXIO_TRANSACTIONS', upserted: nt });
    }
    await sf.setWatermark('maxio_contracts', now, env.ETL_KV);
  } catch (e) {
    results.push({ source: 'maxio', table: 'MAXIO_CONTRACTS', upserted: 0, error: String(e) });
  }

  return results;
}
