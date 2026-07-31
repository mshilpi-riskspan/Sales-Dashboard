export function isClientTier(tier) {
  return !!tier?.toLowerCase().includes('client');
}

export function isTargetProspectTier(tier) {
  return tier === 'Tier 1 Prospect' || tier === 'Tier 2 Prospect';
}
