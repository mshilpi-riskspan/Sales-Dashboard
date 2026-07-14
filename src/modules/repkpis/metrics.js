import { differenceInWeeks, differenceInCalendarMonths, differenceInDays, startOfQuarter, endOfQuarter } from 'date-fns';

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

export function computeMetrics(tasks, events, oppsQtr, oppsYtd, openOpps, repId = null) {
  const filterRep = (arr) => repId ? arr.filter((r) => r.OwnerId === repId) : arr;

  const repTasks = filterRep(tasks || []);
  const repEvents = filterRep(events || []);
  const repOppsQtr = filterRep(oppsQtr || []);
  const repOppsYtd = filterRep(oppsYtd || []);
  const repOpenOpps = filterRep(openOpps || []);

  // Activity
  const outboundEmails = repTasks.filter(
    (t) => t.Type === 'Email' || t.Subject?.toLowerCase().includes('outreach')
  ).length;
  const outboundPerWeek = (outboundEmails / weeksElapsedThisQuarter()).toFixed(1);

  // All Events are calendar meetings in this org (Virtual_meeting, Face-to-Face Meeting, or untyped).
  // Tasks with Type='Call' are phone calls — excluded from meeting count.
  const totalMeetings = repEvents.length;
  const meetingsPerMonth = (totalMeetings / monthsElapsedThisQuarter()).toFixed(1);

  // Pipeline Growth
  const newPipelineArr = repOppsQtr
    .filter((o) => !o.IsClosed)
    .reduce((s, o) => s + arrOrAmount(o), 0);

  // Fix: activePipeline = ALL open opps (not just those created this quarter)
  const activePipelineArr = repOpenOpps
    .reduce((s, o) => s + arrOrAmount(o), 0);

  // Deal Progression — restricted to core pipeline stages only
  const PIPELINE_STAGES = new Set([
    'Initial Demo / SQL', 'Technical Fit Agreement', 'Proposal (pricing) Delivered',
    'Trial', 'Negotiation & Decision Making', 'Contract Sent for Signature',
  ]);
  const pipelineOpenOpps = repOpenOpps.filter((o) => PIPELINE_STAGES.has(o.StageName));
  const qtrOpenOpps = repOppsQtr.filter((o) => !o.IsClosed);
  const technicalFitDeals = pipelineOpenOpps.filter((o) => o.StageName === 'Technical Fit Agreement').length;

  // Trial → Proposal: pipeline deals at Trial or later
  const laterStages = new Set(['Proposal (pricing) Delivered', 'Trial', 'Negotiation & Decision Making', 'Contract Sent for Signature']);
  const trialAndLater = pipelineOpenOpps.filter((o) => laterStages.has(o.StageName));
  const trialToProposalRate = trialAndLater.length > 0
    ? (trialAndLater.filter((o) => o.StageName !== 'Trial').length / trialAndLater.length) * 100
    : null;

  // Avg Days in Stage: average across pipeline deals only
  const now = new Date();
  const qtrStart = startOfQuarter(now);
  const qtrEnd = endOfQuarter(now);
  const openWithStageDate = pipelineOpenOpps.filter((o) => o.LastStageChangeDate || o.CreatedDate);
  const avgDaysInStage = openWithStageDate.length > 0
    ? Math.round(openWithStageDate.reduce((s, o) => s + differenceInDays(now, new Date(o.LastStageChangeDate || o.CreatedDate)), 0) / openWithStageDate.length)
    : null;

  // Stage 2 (Technical Fit) velocity — avg days currently in that stage
  const stage2Opps = pipelineOpenOpps.filter((o) => o.StageName === 'Technical Fit Agreement');
  const stage2VelocityRaw = stage2Opps.length > 0
    ? Math.round(stage2Opps.reduce((s, o) => s + differenceInDays(now, new Date(o.LastStageChangeDate || o.CreatedDate)), 0) / stage2Opps.length)
    : null;

  // Stage 4 (Trial) velocity — avg days currently in that stage
  const stage4Opps = pipelineOpenOpps.filter((o) => o.StageName === 'Trial');
  const stage4VelocityRaw = stage4Opps.length > 0
    ? Math.round(stage4Opps.reduce((s, o) => s + differenceInDays(now, new Date(o.LastStageChangeDate || o.CreatedDate)), 0) / stage4Opps.length)
    : null;

  // Revenue — use YTD data filtered to current quarter close dates (oppsQtr uses CreatedDate which misses prior-quarter deals)
  const arrClosedQtr = repOppsYtd
    .filter((o) => {
      if (!o.IsWon || !o.CloseDate) return false;
      const cd = new Date(o.CloseDate + 'T00:00:00');
      return cd >= qtrStart && cd <= qtrEnd;
    })
    .reduce((s, o) => s + arrOrAmount(o), 0);

  const arrYtd = repOppsYtd
    .filter((o) => o.IsWon)
    .reduce((s, o) => s + arrOrAmount(o), 0);

  const closedOpps = [...repOppsQtr, ...repOppsYtd].filter((o) => o.IsClosed);
  const uniqueClosed = Array.from(new Map(closedOpps.map((o) => [o.Id, o])).values());
  const withReason = uniqueClosed.filter((o) => o.Description || o.ForecastCategoryName).length;
  const winLossRate = uniqueClosed.length > 0 ? (withReason / uniqueClosed.length) * 100 : null;

  return {
    // Formatted display values
    outboundPerWeek,
    meetingsPerMonth,
    newPipelineArr: formatCurrency(newPipelineArr),
    activePipelineArr: formatCurrency(activePipelineArr),
    technicalFitDeals,
    trialToProposalRate: formatPct(trialToProposalRate),
    avgDaysInStage: avgDaysInStage !== null ? `${avgDaysInStage}d` : '—',
    stage2Velocity: stage2VelocityRaw !== null ? `${stage2VelocityRaw}d` : '—',
    stage4Velocity: stage4VelocityRaw !== null ? `${stage4VelocityRaw}d` : '—',
    arrClosedQtr: formatCurrency(arrClosedQtr),
    arrYtd: formatCurrency(arrYtd),
    winLossRate: formatPct(winLossRate),
    // Raw numbers for goal-progress computation in section components
    outboundPerWeekRaw: outboundEmails / weeksElapsedThisQuarter(),
    meetingsPerMonthRaw: totalMeetings / monthsElapsedThisQuarter(),
    newPipelineArrRaw: newPipelineArr,
    activePipelineArrRaw: activePipelineArr,
    arrClosedQtrRaw: arrClosedQtr,
    trialToProposalRaw: trialToProposalRate,
    winLossRateRaw: winLossRate,
    stage2VelocityRaw,
    stage4VelocityRaw,
    // Raw slices for drill-down panels (prefixed with _ to distinguish from display values)
    _emailTasks: repTasks.filter((t) => t.Type === 'Email' || t.Subject?.toLowerCase().includes('outreach')),
    _meetingActivities: repEvents.map((e) => ({ ...e, _src: 'event' })),
    _newPipelineOpps: repOppsQtr.filter((o) => !o.IsClosed),
    _activePipelineOpps: repOpenOpps,
    _technicalFitOpps: pipelineOpenOpps.filter((o) => o.StageName === 'Technical Fit Agreement'),
    _stage2Opps: stage2Opps,
    _stage4Opps: stage4Opps,
    _trialAndLaterOpps: trialAndLater,
    _closedQtrOpps: repOppsYtd.filter((o) => {
      if (!o.IsWon || !o.CloseDate) return false;
      const cd = new Date(o.CloseDate + 'T00:00:00');
      return cd >= qtrStart && cd <= qtrEnd;
    }),
    _closedYtdOpps: repOppsYtd.filter((o) => o.IsWon),
    _uniqueClosedOpps: uniqueClosed,
  };
}

export function computePerRepMetrics(tasks, events, oppsQtr, oppsYtd, openOpps) {
  const repIds = new Map();

  for (const arr of [tasks, events, oppsQtr, oppsYtd, openOpps]) {
    for (const r of arr || []) {
      if (r.OwnerId && !repIds.has(r.OwnerId)) {
        repIds.set(r.OwnerId, r.Owner?.Name || r.OwnerId);
      }
    }
  }

  return Array.from(repIds.entries()).map(([id, name]) => ({
    id,
    name,
    ...computeMetrics(tasks, events, oppsQtr, oppsYtd, openOpps, id),
  }));
}
