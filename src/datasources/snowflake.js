// Client-side wrapper around the read-only Snowflake endpoints in
// functions/api/snowflake/*.js. The browser never sends SQL — these just
// call fixed server routes and shape the response.

const CLIENT_COLUMNS = [
  'clientId', 'clientName', 'displayName', 'salesforceAccountId',
  'snowflakeClientIdentifier', 'contractTier', 'isActive',
  'impliedIsActive', 'industry', 'segment', 'salesLead',
  'freshdeskCompanyId', 'jiraProjectKey',
];

export async function fetchSnowflakeClients() {
  const res = await fetch('/api/snowflake/clients');
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || 'Snowflake query failed');
  // Snowflake's SQL API returns rows as arrays of stringified values, ordered
  // to match the SELECT list in functions/api/snowflake/clients.js.
  return (json.data || []).map((row) => {
    const obj = {};
    CLIENT_COLUMNS.forEach((key, i) => { obj[key] = row[i]; });
    return obj;
  });
}

// { accountId } or { clientId } — pass whichever is already known. The
// server resolves CLIENT_ID from accountId itself via DIM_CLIENT when a
// clientId isn't already in hand (e.g. from a confirmed manual mapping).
export async function fetchAccountUsage({ accountId, clientId } = {}) {
  const params = clientId
    ? `clientId=${encodeURIComponent(clientId)}`
    : `accountId=${encodeURIComponent(accountId)}`;
  const res = await fetch(`/api/snowflake/account-usage?${params}`);
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || 'Snowflake query failed');
  return json;
}

// Daily-grain usage rows for the flexible usage chart on AccountView —
// { usageDaily, distinctUsersDaily, failures }. Kept separate from
// fetchAccountUsage() so adjusting the chart's lookback window only
// refetches this, not the other ~8 unrelated per-account queries.
export async function fetchAccountUsageChartData({ accountId, clientId, daysBack } = {}) {
  const params = new URLSearchParams();
  if (clientId) params.set('clientId', clientId);
  else if (accountId) params.set('accountId', accountId);
  if (daysBack) params.set('daysBack', daysBack);
  const res = await fetch(`/api/snowflake/account-usage-chart?${params}`);
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || 'Snowflake query failed');
  return json;
}

// Bulk, all-clients-at-once Snowflake data for the Current Clients page —
// { health, usage, distinctUsers, support, commercial, daas, batch, failures }.
// Rows already come back cast (numbers/booleans/dates), unlike fetchSnowflakeClients()
// above, since functions/_lib/currentClients.js uses the same named-object
// casting as functions/_lib/accountUsage.js rather than positional arrays.
export async function fetchCurrentClientsSnowflakeData() {
  const res = await fetch('/api/snowflake/current-clients');
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || 'Snowflake query failed');
  return json;
}
