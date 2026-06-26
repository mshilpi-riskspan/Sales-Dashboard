import KpiCard from '../../components/common/KpiCard';

export default function DealProgressionSection({ metrics, loading }) {
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
        />
        <KpiCard
          title="Trial → Proposal Rate"
          value={metrics?.trialToProposalRate}
          subtitle="Deals at Trial or later that advanced past Trial"
          category="dealProgression"
          loading={loading}
        />
        <KpiCard
          title="Avg Days / Stage"
          value="—"
          subtitle="Requires stage history (OpportunityFieldHistory)"
          category="dealProgression"
          loading={loading}
        />
      </div>
    </div>
  );
}
