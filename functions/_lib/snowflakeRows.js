// Shared row-casting helpers for the Snowflake SQL API's JSON response shape.
// Snowflake returns every value as a string; cast by declared column type so
// callers get real numbers/booleans/dates back instead of re-parsing strings
// themselves. Used by both functions/_lib/accountUsage.js (per-client) and
// functions/_lib/currentClients.js (bulk, all-clients).

export function castValue(raw, sfType) {
  if (raw === null || raw === undefined) return null;
  const t = (sfType || '').toLowerCase();
  if (['fixed', 'number', 'decimal', 'numeric', 'float', 'real', 'double'].includes(t)) {
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
  }
  if (t === 'boolean') return raw === 'true' || raw === '1';
  if (t === 'date') {
    const days = Number(raw);
    return Number.isInteger(days) ? new Date(days * 86400000).toISOString().slice(0, 10) : raw;
  }
  if (['timestamp_ntz', 'timestamp_ltz', 'timestamp_tz'].includes(t)) {
    const secs = Number(raw);
    return Number.isFinite(secs) ? new Date(secs * 1000).toISOString() : raw;
  }
  if (t === 'array' || t === 'object' || t === 'variant') {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

export function rowsToObjects(result) {
  const cols = result?.resultSetMetaData?.rowType || [];
  return (result?.data || []).map((row) => {
    const obj = {};
    cols.forEach((c, i) => { obj[c.name] = castValue(row[i], c.type); });
    return obj;
  });
}

export function firstRowObject(result) {
  return rowsToObjects(result)[0] || null;
}
