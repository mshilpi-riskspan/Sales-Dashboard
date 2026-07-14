import KpiCard from '../../components/common/KpiCard';

export default function DealProgressionSection({ metrics, loading, onDrill }) {
  const techFitPct  = metrics ? Math.round((metrics.technicalFitDeals / 4) * 100) : null;
  const trialPct    = metrics?.trialToProposalRaw != null ? Math.round((metrics.trialToProposalRaw / 65) * 100) : null;
  // Velocity: lower = better → goalPct = (goal / actual) * 100
  const stage2Pct   = metrics?.stage2VelocityRaw != null ? Math.round((40 / metrics.stage2VelocityRaw) * 100) : null;
  const stage4Pct   = metrics?.stage4VelocityRaw != null ? Math.round((47 / metrics.stage4VelocityRaw) * 100) : null;

  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-widest text-rs-muted mb-3">Deal Progression</h2>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <KpiCard
          title="Deals at Technical Fit"
          value={metrics?.technicalFitDeals}
          category="dealProgression"
          loading={loading}
          goal={4}
          goalLabel="Goal: ≥4 active"
          goalPct={techFitPct}
          onClick={onDrill ? () => onDrill('Deals at Technical Fit', metrics?._technicalFitOpps, 'opps') : undefined}
        />
        <KpiCard
          title="Trial → Proposal Rate"
          value={metrics?.trialToProposalRate}
          category="dealProgression"
          loading={loading}
          goal={65}
          goalLabel="Goal: ≥65%"
          goalPct={trialPct}
          onClick={onDrill ? () => onDrill('Trial Stage & Beyond', metrics?._trialAndLaterOpps, 'opps') : undefined}
        />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <KpiCard
          title="Stage 2 Velocity"
          value={metrics?.stage2Velocity}
          subtitle={metrics?.stage2VelocityRaw != null ? `Avg days in Technical Fit (${metrics._stage2Opps?.length ?? 0} deals)` : 'No deals at Technical Fit'}
          category="dealProgression"
          loading={loading}
          goal={stage2Pct != null ? 40 : undefined}
          goalLabel="Goal: <40 days"
          goalPct={stage2Pct}
          onClick={onDrill && metrics?._stage2Opps?.length ? () => onDrill('Technical Fit Deals', metrics._stage2Opps, 'opps') : undefined}
        />
        <KpiCard
          title="Stage 4 Velocity"
          value={metrics?.stage4Velocity}
          subtitle={metrics?.stage4VelocityRaw != null ? `Avg days in Trial (${metrics._stage4Opps?.length ?? 0} deals)` : 'No deals at Trial'}
          category="dealProgression"
          loading={loading}
          goal={stage4Pct != null ? 47 : undefined}
          goalLabel="Goal: <47 days"
          goalPct={stage4Pct}
          onClick={onDrill && metrics?._stage4Opps?.length ? () => onDrill('Trial Deals', metrics._stage4Opps, 'opps') : undefined}
        />
        <KpiCard
          title="Avg Days / Stage"
          value={metrics?.avgDaysInStage}
          subtitle="Average days in current stage across all open deals"
          category="dealProgression"
          loading={loading}
        />
      </div>
    </div>
  );
}
