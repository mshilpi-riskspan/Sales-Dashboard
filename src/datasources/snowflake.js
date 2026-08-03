// Client-side wrapper around the read-only Snowflake endpoints in
// functions/api/snowflake/*.js. The browser never sends SQL — these just
// call fixed server routes and shape the response.

const CLIENT_COLUMNS = [
  'clientId', 'clientName', 'displayName', 'salesforceAccountId',
  'snowflakeClientIdentifier', 'contractTier', 'isActive',
  'impliedIsActive', 'industry', 'segment', 'salesLead',
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
