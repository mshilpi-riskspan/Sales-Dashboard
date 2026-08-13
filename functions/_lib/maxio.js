// Maxio (SaaSOptics) connector — bulk fetch of customers/contracts/
// transactions/items, for the Current Clients page and AccountView. No
// client-supplied input, ever — this always pulls the same fixed dataset;
// matching to a specific account happens downstream in
// src/lib/externalDataMatch.js.
//
// Auth: SaaSOptics' REST API uses Django REST Framework TokenAuthentication —
// `Authorization: Token <key>` (confirmed live against the sandbox; the
// Bearer/Basic/"Token token=..." variants all 403).
//
// ARR lives on /transactions (the actual subscription line items), not on
// /contracts — each transaction has home_arr_amount, start_date/end_date
// (the renewal date), and a cancelled flag. A contract is just the grouping
// header; a customer can have several contracts, each with several
// transactions (one per product/module/term).
//
// Each resource is fetched via its OWN Cloudflare Function invocation
// (functions/api/maxio/<resource>.js), not one combined endpoint — this
// dataset needs ~5 pages for customers, ~19 for contracts, ~15 for
// transactions, ~17 for items (100 rows/page, server-enforced, larger
// per_page values are silently capped). Fetching all four concurrently
// within a single incoming request blew past Cloudflare's ~50-subrequest-
// per-request ceiling (confirmed live: contracts/transactions came back
// empty with "failures":["contracts","transactions"] in production while
// customers/items — fetched first and cheaper — succeeded). Splitting into
// four separately-invoked endpoints gives each its own subrequest budget.

const REQUIRED_ENV_VARS = ['MAXIO_API_TOKEN', 'MAXIO_BASE_URL'];

function assertConfigured(env) {
  const missing = REQUIRED_ENV_VARS.filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(`Missing Maxio env var(s): ${missing.join(', ')}`);
  }
}

function authHeader(env) {
  return `Token ${env.MAXIO_API_TOKEN}`;
}

async function maxioFetch(env, url, retriesLeft = 3) {
  const res = await fetch(url, {
    headers: { Authorization: authHeader(env), Accept: 'application/json' },
  });

  if (res.status === 429 && retriesLeft > 0) {
    const retryAfter = Number(res.headers.get('Retry-After')) || 2;
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    return maxioFetch(env, url, retriesLeft - 1);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Maxio request failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json();
}

// Follows the DRF-style `next` pagination URL directly rather than
// reconstructing page numbers — capped so one runaway resource can't hang
// the whole fetch.
const MAX_PAGES = 30;

async function fetchAllPages(env, path) {
  const rows = [];
  let url = `${env.MAXIO_BASE_URL}${path}${path.includes('?') ? '&' : '?'}per_page=100`;
  for (let page = 0; page < MAX_PAGES && url; page++) {
    const data = await maxioFetch(env, url);
    rows.push(...(data.results || []));
    url = data.next || null;
  }
  return rows;
}

async function fetchMaxioResource(env, key, path) {
  assertConfigured(env);
  try {
    return { [key]: await fetchAllPages(env, path), failures: [] };
  } catch {
    return { [key]: [], failures: [key] };
  }
}

export function fetchMaxioCustomers(env) {
  return fetchMaxioResource(env, 'customers', '/customers');
}

export function fetchMaxioContracts(env) {
  return fetchMaxioResource(env, 'contracts', '/contracts');
}

export function fetchMaxioTransactions(env) {
  return fetchMaxioResource(env, 'transactions', '/transactions');
}

export function fetchMaxioItems(env) {
  return fetchMaxioResource(env, 'items', '/items');
}
