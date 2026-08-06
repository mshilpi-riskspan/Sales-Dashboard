// Client-side wrapper around /api/maxio/current — the browser never sends
// credentials, just calls the fixed server route. Cached in-memory for 5
// minutes, same pattern as src/datasources/freshdesk.js.
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_KEY = '/api/maxio/current';

function isCacheValid(entry) {
  return entry && Date.now() - entry.timestamp < CACHE_TTL;
}

export async function fetchMaxioData() {
  const cached = cache.get(CACHE_KEY);
  if (isCacheValid(cached)) return cached.data;

  const res = await fetch(CACHE_KEY);
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || 'Maxio query failed');

  cache.set(CACHE_KEY, { data: json, timestamp: Date.now() });
  return json;
}
