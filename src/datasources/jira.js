// Client-side wrapper around /api/jira/current — same 5-minute in-memory
// cache pattern as src/datasources/salesforce.js and src/datasources/freshdesk.js.
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_KEY = '/api/jira/current';

function isCacheValid(entry) {
  return entry && Date.now() - entry.timestamp < CACHE_TTL;
}

export async function fetchJiraData() {
  const cached = cache.get(CACHE_KEY);
  if (isCacheValid(cached)) return cached.data;

  const res = await fetch(CACHE_KEY);
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || 'Jira query failed');

  cache.set(CACHE_KEY, { data: json, timestamp: Date.now() });
  return json;
}
