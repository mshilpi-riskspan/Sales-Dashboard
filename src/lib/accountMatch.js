const CORPORATE_SUFFIXES = /\b(llc|inc|corp|ltd|co|company|group|the)\b/g;

function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[.,'"]/g, '')
    .replace(CORPORATE_SUFFIXES, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigrams(str) {
  const s = str.replace(/\s+/g, '');
  if (s.length < 2) return new Set([s]);
  const grams = new Set();
  for (let i = 0; i < s.length - 1; i++) grams.add(s.slice(i, i + 2));
  return grams;
}

// Dice coefficient over character bigrams — cheap, dependency-free, and good
// enough to rank candidates for human review (this never auto-applies a
// match on its own; every suggestion still requires an explicit Accept).
export function similarityScore(a, b) {
  const normA = normalizeName(a);
  const normB = normalizeName(b);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;

  const gramsA = bigrams(normA);
  const gramsB = bigrams(normB);
  let overlap = 0;
  for (const g of gramsA) {
    if (gramsB.has(g)) overlap++;
  }
  return (2 * overlap) / (gramsA.size + gramsB.size);
}

export function matchConfidence(score) {
  if (score >= 0.85) return 'high';
  if (score >= 0.6) return 'medium';
  return 'low';
}

export function findBestMatch(clientName, accounts) {
  let best = null;
  let bestScore = -1;
  for (const account of accounts) {
    const score = similarityScore(clientName, account.Name);
    if (score > bestScore) {
      bestScore = score;
      best = account;
    }
  }
  return best ? { account: best, score: bestScore } : null;
}

// A short, manually-typed admin label (e.g. "PacLife") won't score well
// against a client's full legal name via bigram similarity alone
// ("Pacific Life Insurance Company" vs "PacLife" scores far below any sane
// threshold) — check for plain substring containment first, same
// bidirectional check the per-client Snowflake SQL queries already use
// against DIM_CLIENT's curated DISPLAY_NAME, before falling back to a score.
export function looksLikeMatch(nameA, nameB, threshold = 0.5) {
  const a = (nameA || '').toLowerCase().trim();
  const b = (nameB || '').toLowerCase().trim();
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  return similarityScore(nameA, nameB) >= threshold;
}

// Alnum-only lowercase, for loose CLIENT_TAG/DAG_ID/tag matching (Airflow,
// Astronomer) where identifiers are short slugs rather than display names.
export function normalizeForTagMatch(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
