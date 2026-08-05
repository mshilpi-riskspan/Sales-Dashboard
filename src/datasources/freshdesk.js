// Client-side wrapper around /api/freshdesk/current — the browser never
// sends credentials, just calls the fixed server route. Cached in-memory for
// 5 minutes, same pattern as src/datasources/salesforce.js, since this is a
// bulk fetch with no per-call params — every caller within the TTL reuses
// the same payload instead of re-hitting the live Freshdesk API.
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_KEY = '/api/freshdesk/current';

function isCacheValid(entry) {
  return entry && Date.now() - entry.timestamp < CACHE_TTL;
}

export async function fetchFreshdeskData() {
  const cached = cache.get(CACHE_KEY);
  if (isCacheValid(cached)) return cached.data;

  const res = await fetch(CACHE_KEY);
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || 'Freshdesk query failed');

  cache.set(CACHE_KEY, { data: json, timestamp: Date.now() });
  return json;
}
