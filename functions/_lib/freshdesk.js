// Freshdesk connector — bulk fetch of all tickets + all companies, for the
// Current Clients page and AccountView. No client-supplied input, ever —
// this always pulls the same fixed dataset; matching to a specific account
// happens downstream in src/lib/externalDataMatch.js.
//
// Auth: Freshdesk's documented convention is HTTP Basic with the API key as
// the username and the literal string "X" as the password.

const REQUIRED_ENV_VARS = ['FRESHDESK_API_KEY', 'FRESHDESK_DOMAIN'];

function assertConfigured(env) {
  const missing = REQUIRED_ENV_VARS.filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(`Missing Freshdesk env var(s): ${missing.join(', ')}`);
  }
}

function authHeader(env) {
  return 'Basic ' + btoa(`${env.FRESHDESK_API_KEY}:X`);
}

async function freshdeskFetch(env, path, retriesLeft = 3) {
  const res = await fetch(`https://${env.FRESHDESK_DOMAIN}.freshdesk.com/api/v2${path}`, {
    headers: { Authorization: authHeader(env), 'Content-Type': 'application/json' },
  });

  if (res.status === 429 && retriesLeft > 0) {
    const retryAfter = Number(res.headers.get('Retry-After')) || 2;
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    return freshdeskFetch(env, path, retriesLeft - 1);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Freshdesk request failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json();
}

// GET /tickets?per_page=100&page=N&include=stats&order_by=updated_at&order_type=desc
// Capped at MAX_PAGES — recent/updated tickets sort first, so a cap just
// means very old untouched tickets fall out of scope, which is fine for a
// "current support load" view.
const MAX_TICKET_PAGES = 20;

async function fetchAllTickets(env) {
  const tickets = [];
  for (let page = 1; page <= MAX_TICKET_PAGES; page++) {
    const batch = await freshdeskFetch(
      env,
      `/tickets?per_page=100&page=${page}&include=stats&order_by=updated_at&order_type=desc&updated_since=2010-01-01T00:00:00Z`
    );
    tickets.push(...batch);
    if (batch.length < 100) break;
  }
  return tickets;
}

// GET /companies?per_page=100&page=N — id/name lookup, used to fuzzy-match
// tickets whose company has no DIM_CLIENT.FRESHDESK_COMPANY_ID mapping yet
// (only 14/161 clients have that direct FK set).
const MAX_COMPANY_PAGES = 10;

async function fetchAllCompanies(env) {
  const companies = [];
  for (let page = 1; page <= MAX_COMPANY_PAGES; page++) {
    const batch = await freshdeskFetch(env, `/companies?per_page=100&page=${page}`);
    companies.push(...batch);
    if (batch.length < 100) break;
  }
  return companies;
}

export async function fetchFreshdeskData(env) {
  assertConfigured(env);

  const [ticketsResult, companiesResult] = await Promise.allSettled([
    fetchAllTickets(env),
    fetchAllCompanies(env),
  ]);

  const failures = [];
  const tickets = ticketsResult.status === 'fulfilled' ? ticketsResult.value : (failures.push('tickets'), []);
  const companies = companiesResult.status === 'fulfilled' ? companiesResult.value : (failures.push('companies'), []);

  return { tickets, companies, failures };
}
