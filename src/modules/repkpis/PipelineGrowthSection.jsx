import KpiCard from '../../components/common/KpiCard';

export default function PipelineGrowthSection({ metrics, loading, onDrill }) {
  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-widest text-rs-muted mb-3">Pipeline Growth</h2>
      <div className="grid grid-cols-2 gap-4">
        <KpiCard
          title="New Pipeline This Quarter"
          value={metrics?.newPipelineArr}
          subtitle="ARR of new open opps created this quarter"
          category="pipeline"
          loading={loading}
          onClick={onDrill ? () => onDrill('New Pipeline This Quarter', metrics?._newPipelineOpps, 'opps') : undefined}
        />
        <KpiCard
          title="Active Pipeline Coverage"
          value={metrics?.activePipelineArr}
          subtitle="Total open ARR in active pipeline"
          category="pipeline"
          loading={loading}
          onClick={onDrill ? () => onDrill('Active Pipeline', metrics?._newPipelineOpps, 'opps') : undefined}
        />
      </div>
    </div>
  );
}
