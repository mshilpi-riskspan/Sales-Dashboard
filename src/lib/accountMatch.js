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
