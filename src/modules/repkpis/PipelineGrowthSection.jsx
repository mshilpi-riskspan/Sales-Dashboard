import KpiCard from '../../components/common/KpiCard';

const PIPELINE_GOAL = 500_000;
const ACTIVE_COVERAGE_GOAL = 1_500_000;

export default function PipelineGrowthSection({ metrics, loading, onDrill }) {
  const newPipelinePct = metrics ? Math.round((metrics.newPipelineArrRaw / PIPELINE_GOAL) * 100) : null;
  const activePipelinePct = metrics ? Math.round((metrics.activePipelineArrRaw / ACTIVE_COVERAGE_GOAL) * 100) : null;

  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-widest text-rs-muted mb-3">Pipeline Growth</h2>
      <div className="grid grid-cols-2 gap-4">
        <KpiCard
          title="Pipeline Created This Quarter"
          value={metrics?.newPipelineArr}
          category="pipeline"
          loading={loading}
          goal={PIPELINE_GOAL}
          goalLabel="Goal: ≥$500K/quarter"
          goalPct={newPipelinePct}
          onClick={onDrill ? () => onDrill('New Pipeline This Quarter', metrics?._newPipelineOpps, 'opps') : undefined}
        />
        <KpiCard
          title="Active Pipeline Coverage"
          value={metrics?.activePipelineArr}
          category="pipeline"
          loading={loading}
          goal={ACTIVE_COVERAGE_GOAL}
          goalLabel="Goal: ≥$1.5M (4× quota)"
          goalPct={activePipelinePct}
          onClick={onDrill ? () => onDrill('Active Pipeline', metrics?._activePipelineOpps, 'opps') : undefined}
        />
      </div>
    </div>
  );
}
