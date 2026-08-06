// Reads the same 'snowflakeAccountMap' localStorage key that
// src/modules/settings/AccountMapping.jsx writes to, so AccountView can
// resolve a Snowflake CLIENT_ID for accounts a human manually confirmed
// there — including ones with no SALESFORCE_ACCOUNT_ID in DIM_CLIENT at all.
const MAP_KEY = 'snowflakeAccountMap';

export function findConfirmedClientId(accountId) {
  if (!accountId) return null;
  try {
    const map = JSON.parse(localStorage.getItem(MAP_KEY) || '{}');
    const entry = Object.entries(map).find(
      ([, v]) => v.status === 'confirmed' && v.salesforceAccountId === accountId
    );
    return entry ? entry[0] : null;
  } catch {
    return null;
  }
}

// Single source of truth for the Account <-> DIM_CLIENT.CLIENT_ID mapping
// status (verified/confirmed/pending/stale/rejected) — used by both
// AccountMapping.jsx (one row per Snowflake client) and
// currentClientsMerge.js (looked up per Salesforce account), so the two
// pages can never disagree on what "verified" means.
export function resolveClientMappingStatuses({ accounts, snowflakeClients, overrideMap }) {
  const accountsById = new Map((accounts || []).map((a) => [a.Id, a]));

  return (snowflakeClients || []).map((c) => {
    const clientName = c.displayName || c.clientName;
    const override = overrideMap?.[c.clientId];

    let sourceType;
    let resolvedAccount = null;

    if (c.salesforceAccountId) {
      resolvedAccount = accountsById.get(c.salesforceAccountId) || null;
      sourceType = resolvedAccount ? 'verified' : 'stale';
    } else {
      sourceType = 'pending';
    }

    const status = override?.status || sourceType;

    return {
      clientId: c.clientId,
      clientName,
      resolvedAccountId: resolvedAccount?.Id || null,
      mappedAccountId: (status === 'confirmed' && override?.salesforceAccountId) || null,
      status,
    };
  });
}
