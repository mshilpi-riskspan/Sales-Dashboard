import KpiCard from '../../components/common/KpiCard';

const ARR_QTR_GOAL = 375_000;

export default function RevenueSection({ metrics, loading, onDrill }) {
  const arrQtrPct    = metrics ? Math.round((metrics.arrClosedQtrRaw / ARR_QTR_GOAL) * 100) : null;
  const winLossPct   = metrics?.winLossRateRaw != null ? Math.round(metrics.winLossRateRaw) : null;

  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-widest text-rs-muted mb-3">Revenue</h2>
      <div className="grid grid-cols-3 gap-4">
        <KpiCard
          title="ARR Closed This Quarter"
          value={metrics?.arrClosedQtr}
          category="revenue"
          loading={loading}
          goal={ARR_QTR_GOAL}
          goalLabel="Goal: $375K/quarter"
          goalPct={arrQtrPct}
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
          category="revenue"
          loading={loading}
          goal={100}
          goalLabel="Goal: 100% logged"
          goalPct={winLossPct}
          onClick={onDrill ? () => onDrill('Closed Opps (Win/Loss)', metrics?._uniqueClosedOpps, 'opps') : undefined}
        />
      </div>
    </div>
  );
}
