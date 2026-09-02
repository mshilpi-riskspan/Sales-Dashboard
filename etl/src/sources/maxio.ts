import type { Env, SyncResult } from '../types';
import type { SnowflakeClient } from '../snowflake';

const PAGE_SIZE = 100; // server-enforced cap

async function maxioGet(path: string, env: Env): Promise<unknown> {
  const base = env.MAXIO_BASE_URL.replace(/\/$/, '');
  const sep = path.includes('?') ? '&' : '?';
  let url = `${base}${path}${sep}per_page=${PAGE_SIZE}`;
  const items: Record<string, unknown>[] = [];
  while (url) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Token ${env.MAXIO_API_TOKEN}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) throw new Error(`Maxio ${path}: ${res.status} ${(await res.text()).slice(0, 300)}`);
    const data = await res.json() as unknown;
    const page: Record<string, unknown>[] = Array.isArray(data) ? data : [];
    items.push(...page);
    // Follow DRF-style next link if present
    const nextUrl = (data as Record<string, unknown>)?.next as string | undefined;
    url = (nextUrl && page.length === PAGE_SIZE) ? nextUrl : '';
  }
  return items;
}

async function fetchAll<T>(path: string, key: string, env: Env): Promise<T[]> {
  const raw = await maxioGet(path, env) as Record<string, unknown>[];
  return raw.map(item => (item[key] ?? item) as T);
}

export async function syncMaxio(sf: SnowflakeClient, env: Env): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  const now = new Date().toISOString();

  // Customers
  try {
    const customers = await fetchAll<Record<string, unknown>>('/customers', 'customer', env);
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
    const products = await fetchAll<Record<string, unknown>>('/items', 'item', env);
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
    const subs = await fetchAll<Record<string, unknown>>(`/contracts${since ? '?updated_since=' + since.slice(0, 10) : ''}`, 'contract', env);
    const contractRows = subs.map(s => [s.id as number, (s.customer as Record<string, unknown>)?.id as number ?? null, now]);
    const nc = await sf.mergeRows('MAXIO_CONTRACTS', 'ID', ['ID', 'CUSTOMER_ID', '_SYNCED_AT'], contractRows);
    results.push({ source: 'maxio', table: 'MAXIO_CONTRACTS', upserted: nc });

    // Transactions / line items
    const txRows: (string | number | boolean | null)[][] = [];
    for (const sub of subs) {
      try {
        const txs = await maxioGet(`/contracts/${sub.id}/transactions`, env) as Record<string, unknown>[];
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
