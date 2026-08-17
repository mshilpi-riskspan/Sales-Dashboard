export function isClientTier(tier) {
  return !!tier?.toLowerCase().includes('client');
}

export function isTargetProspectTier(tier) {
  return tier === 'Tier 1 Prospect' || tier === 'Tier 2 Prospect';
}

// Matches the "Current Clients" Salesforce report filter exactly: Account
// Type equals Platform Client (stored picklist value "Customer") or Both
// Platform and Consulting Client, AND ARR at End of Month > $0. Applied
// automatically (see CurrentClientsPage.jsx's candidateAccounts) whenever a
// *Client* tier is selected in the Tier filter, so "Tier 1 Client" actually
// means what the report means — not a second filter dropdown to maintain.
const CURRENT_CLIENT_TYPES = new Set(['Customer', 'Both Platform and Consulting Client']);

export function isCurrentClientType(type) {
  return CURRENT_CLIENT_TYPES.has(type);
}

export function isCurrentClient(account) {
  return isCurrentClientType(account?.Type) && (account?.ArrEndOfMonth ?? 0) > 0;
}

// The Accounts page's default (unsearched) view: real tracked clients and
// prospects only. Excludes "Tier 4 Prospect" (per the field's own help text,
// this is a marketing-only bucket — confirmed live at ~9,700 of the org's
// ~13,000 accounts, essentially the entire untracked long tail) and blank
// tiers. Without this, the default view — and the expensive Freshdesk/Jira/
// Astronomer per-account matching that runs over it — covers the whole
// Account table and locks up the browser.
const TRACKED_TIERS = new Set([
  'Tier 1 Client', 'Tier 2 Client', 'Tier 3 Client',
  'Tier 1 Prospect', 'Tier 2 Prospect', 'Tier 3 Prospect',
]);

export function isTrackedTier(tier) {
  return TRACKED_TIERS.has(tier);
}
