export const REP_GOALS = [
  { match: 'Franklin', name: 'Franklin Lobo', goal: 1_500_000 },
  { match: 'Chris K', name: 'Chris Kennedy', goal: 1_500_000 },
  { match: 'Becky', name: 'Becky Flight', goal: 1_500_000 },
  { match: 'Dan Flei', name: 'Dan Fleishman', goal: 3_000_000 },
];

export const TRACKED_REP_NAMES = REP_GOALS.map((g) => g.match);

export function getRepGoal(sfName) {
  if (!sfName) return null;
  const hit = REP_GOALS.find((g) => sfName.toLowerCase().includes(g.match.toLowerCase()));
  return hit ? hit.goal : null;
}
