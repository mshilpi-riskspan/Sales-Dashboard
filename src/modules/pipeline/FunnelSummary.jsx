import { SALES_STAGES } from '../../config/salesStages';
import FunnelBar from '../../components/common/FunnelBar';

function formatARR(v) {
  if (!v) return '$0';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

export default function FunnelSummary({ stageData, onShowAll }) {
  const totalDeals = SALES_STAGES
    .filter((s) => s.name !== 'Closed Won')
    .reduce((sum, s) => sum + (stageData[s.name]?.deals.length || 0), 0);
  const totalArr = SALES_STAGES
    .filter((s) => s.name !== 'Closed Won')
    .reduce((sum, s) => sum + (stageData[s.name]?.totalArr || 0), 0);

  return (
    <div className="rounded-card border border-rs-border bg-white p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-rs-text">Pipeline Overview</h2>
        <button
          onClick={onShowAll}
          className="flex gap-4 text-xs hover:opacity-80 transition-opacity"
        >
          <span className="text-rs-muted">
            <span className="font-bold text-rs-text text-sm underline decoration-dotted">{totalDeals}</span> open deals
          </span>
          <span className="text-rs-muted">
            <span className="font-bold text-rs-teal text-sm underline decoration-dotted">{formatARR(totalArr)}</span> total ARR in pipeline
          </span>
        </button>
      </div>
      <FunnelBar stageData={stageData} />
    </div>
  );
}
