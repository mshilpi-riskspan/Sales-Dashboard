// Client-side wrapper around the four Maxio resource endpoints — split into
// customers/contracts/transactions/items (each a separate Cloudflare
// Function invocation) rather than one combined /api/maxio/current, because
// fetching all four from within a single incoming request exceeded
// Cloudflare's per-request subrequest limit in production (contracts and
// transactions need ~15-19 pages each; combined with customers/items that's
// ~56 total fetch() calls in one invocation, over the ~50 ceiling). The
// browser fires four parallel requests instead, each with its own budget,
// and merges them back into the same { customers, contracts, transactions,
// items, failures } shape every caller already expects.
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_KEY = 'maxio:bulk';

const RESOURCES = ['customers', 'contracts', 'transactions', 'items'];

function isCacheValid(entry) {
  return entry && Date.now() - entry.timestamp < CACHE_TTL;
}

async function fetchResource(resource) {
  const res = await fetch(`/api/maxio/${resource}`);
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || `Maxio ${resource} query failed`);
  return json;
}

export async function fetchMaxioData() {
  const cached = cache.get(CACHE_KEY);
  if (isCacheValid(cached)) return cached.data;

  const results = await Promise.allSettled(RESOURCES.map(fetchResource));

  const merged = { customers: [], contracts: [], transactions: [], items: [], failures: [] };
  RESOURCES.forEach((resource, i) => {
    const result = results[i];
    if (result.status === 'fulfilled') {
      merged[resource] = result.value[resource] || [];
      merged.failures.push(...(result.value.failures || []));
    } else {
      merged.failures.push(resource);
    }
  });

  cache.set(CACHE_KEY, { data: merged, timestamp: Date.now() });
  return merged;
}
