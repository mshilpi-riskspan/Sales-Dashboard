import { differenceInWeeks, differenceInCalendarMonths, startOfQuarter, startOfYear } from 'date-fns';

function arrOrAmount(opp) {
  return opp.Annual_Recurring_Revenue_ARR__c ?? opp.Amount ?? 0;
}

function weeksElapsedThisQuarter() {
  const now = new Date();
  const start = startOfQuarter(now);
  return Math.max(1, differenceInWeeks(now, start));
}

function monthsElapsedThisQuarter() {
  const now = new Date();
  const start = startOfQuarter(now);
  return Math.max(1, differenceInCalendarMonths(now, start) + 1);
}

function formatCurrency(v) {
  if (!v) return '$0';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${Math.round(v)}`;
}

function formatPct(v) {
  if (v === null || v === undefined) return '—';
  return `${Math.round(v)}%`;
}

export function computeMetrics(tasks, events, oppsQtr, oppsYtd, repId = null) {
  const filterRep = (arr) => repId ? arr.filter((r) => r.OwnerId === repId) : arr;

  const repTasks = filterRep(tasks || []);
  const repEvents = filterRep(events || []);
  const repOppsQtr = filterRep(oppsQtr || []);
  const repOppsYtd = filterRep(oppsYtd || []);

  // Activity
  const outboundEmails = repTasks.filter(
    (t) => t.Type === 'Email' || t.Subject?.toLowerCase().includes('outreach')
  ).length;
  const outboundPerWeek = (outboundEmails / weeksElapsedThisQuarter()).toFixed(1);

  const meetingTasks = repTasks.filter((t) => t.Type === 'Meeting' || t.Type === 'Call');
  const meetingEvents = repEvents.filter((e) => e.Type === 'Meeting' || e.Type === 'Call');
  const totalMeetings = meetingTasks.length + meetingEvents.length;
  const meetingsPerMonth = (totalMeetings / (monthsElapsedThisQuarter() * 3)).toFixed(1);

  // Pipeline Growth
  const newPipelineArr = repOppsQtr
    .filter((o) => !o.IsClosed)
    .reduce((s, o) => s + arrOrAmount(o), 0);

  const activePipelineArr = repOppsQtr
    .filter((o) => !o.IsClosed)
    .reduce((s, o) => s + arrOrAmount(o), 0);

  // Deal Progression
  const openOpps = repOppsQtr.filter((o) => !o.IsClosed);
  const technicalFitDeals = openOpps.filter((o) => o.StageName === 'Technical Fit Agreement').length;

  // Trial → Proposal: opps currently at Proposal stage or later that came from Trial
  // Approximation: count opps currently at stage >= 3 (Proposal or later)
  const laterStages = new Set(['Proposal (pricing) Delivered', 'Trial', 'Negotiation & Decision Making', 'Contract Sent for Signature', 'Closed Won']);
  const trialAndLater = repOppsQtr.filter((o) => laterStages.has(o.StageName));
  const trialToProposalRate = trialAndLater.length > 0
    ? (trialAndLater.filter((o) => o.StageName !== 'Trial').length / trialAndLater.length) * 100
    : null;

  // Revenue
  const arrClosedQtr = repOppsQtr
    .filter((o) => o.IsWon)
    .reduce((s, o) => s + arrOrAmount(o), 0);

  const arrYtd = repOppsYtd
    .filter((o) => o.IsWon)
    .reduce((s, o) => s + arrOrAmount(o), 0);

  const closedOpps = [...repOppsQtr, ...repOppsYtd].filter((o) => o.IsClosed);
  const uniqueClosed = Array.from(new Map(closedOpps.map((o) => [o.Id, o])).values());
  const withReason = uniqueClosed.filter((o) => o.Description || o.ForecastCategoryName).length;
  const winLossRate = uniqueClosed.length > 0 ? (withReason / uniqueClosed.length) * 100 : null;

  return {
    outboundPerWeek,
    meetingsPerMonth,
    newPipelineArr: formatCurrency(newPipelineArr),
    activePipelineArr: formatCurrency(activePipelineArr),
    technicalFitDeals,
    trialToProposalRate: formatPct(trialToProposalRate),
    arrClosedQtr: formatCurrency(arrClosedQtr),
    arrYtd: formatCurrency(arrYtd),
    winLossRate: formatPct(winLossRate),
    // Raw slices for drill-down panels (prefixed with _ to distinguish from display values)
    _emailTasks: repTasks.filter((t) => t.Type === 'Email' || t.Subject?.toLowerCase().includes('outreach')),
    _meetingActivities: [
      ...repTasks.filter((t) => t.Type === 'Meeting' || t.Type === 'Call').map((t) => ({ ...t, _src: 'task' })),
      ...repEvents.filter((e) => e.Type === 'Meeting' || e.Type === 'Call').map((e) => ({ ...e, _src: 'event' })),
    ],
    _newPipelineOpps: repOppsQtr.filter((o) => !o.IsClosed),
    _technicalFitOpps: openOpps.filter((o) => o.StageName === 'Technical Fit Agreement'),
    _trialAndLaterOpps: repOppsQtr.filter((o) => laterStages.has(o.StageName)),
    _closedQtrOpps: repOppsQtr.filter((o) => o.IsWon),
    _closedYtdOpps: repOppsYtd.filter((o) => o.IsWon),
    _uniqueClosedOpps: uniqueClosed,
  };
}

export function computePerRepMetrics(tasks, events, oppsQtr, oppsYtd) {
  const repIds = new Map();

  for (const arr of [tasks, events, oppsQtr, oppsYtd]) {
    for (const r of arr || []) {
      if (r.OwnerId && !repIds.has(r.OwnerId)) {
        repIds.set(r.OwnerId, r.Owner?.Name || r.OwnerId);
      }
    }
  }

  return Array.from(repIds.entries()).map(([id, name]) => ({
    id,
    name,
    ...computeMetrics(tasks, events, oppsQtr, oppsYtd, id),
  }));
}
