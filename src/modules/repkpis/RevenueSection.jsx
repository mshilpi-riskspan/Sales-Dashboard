import KpiCard from '../../components/common/KpiCard';

export default function RevenueSection({ metrics, loading, onDrill }) {
  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-widest text-rs-muted mb-3">Revenue</h2>
      <div className="grid grid-cols-3 gap-4">
        <KpiCard
          title="ARR Closed This Quarter"
          value={metrics?.arrClosedQtr}
          subtitle="Closed Won ARR this quarter"
          category="revenue"
          loading={loading}
          onClick={onDrill ? () => onDrill('ARR Closed This Quarter', metrics?._closedQtrOpps, 'opps') : undefined}
        />
        <KpiCard
          title="ARR Closed YTD"
          value={metrics?.arrYtd}
          subtitle="Closed Won ARR year-to-date"
          category="revenue"
          loading={loading}
          onClick={onDrill ? () => onDrill('ARR Closed YTD', metrics?._closedYtdOpps, 'opps') : undefined}
        />
        <KpiCard
          title="Win/Loss Reason Logged"
          value={metrics?.winLossRate}
          subtitle="% of closed opps with reason populated"
          category="revenue"
          loading={loading}
          onClick={onDrill ? () => onDrill('Closed Opps (Win/Loss)', metrics?._uniqueClosedOpps, 'opps') : undefined}
        />
      </div>
    </div>
  );
}
