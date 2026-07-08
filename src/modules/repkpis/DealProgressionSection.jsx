import KpiCard from '../../components/common/KpiCard';

export default function DealProgressionSection({ metrics, loading, onDrill }) {
  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-widest text-rs-muted mb-3">Deal Progression</h2>
      <div className="grid grid-cols-3 gap-4">
        <KpiCard
          title="Deals at Technical Fit"
          value={metrics?.technicalFitDeals}
          subtitle="Open opps at Stage 2: Technical Fit Agreement"
          category="dealProgression"
          loading={loading}
          onClick={onDrill ? () => onDrill('Deals at Technical Fit', metrics?._technicalFitOpps, 'opps') : undefined}
        />
        <KpiCard
          title="Trial → Proposal Rate"
          value={metrics?.trialToProposalRate}
          subtitle="Deals at Trial or later that advanced past Trial"
          category="dealProgression"
          loading={loading}
          onClick={onDrill ? () => onDrill('Trial Stage & Beyond', metrics?._trialAndLaterOpps, 'opps') : undefined}
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
