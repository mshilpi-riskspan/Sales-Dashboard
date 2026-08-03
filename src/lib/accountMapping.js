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
