import KpiCard from '../../components/common/KpiCard';

export default function RevenueSection({ metrics, loading }) {
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
        />
        <KpiCard
          title="ARR Closed YTD"
          value={metrics?.arrYtd}
          subtitle="Closed Won ARR year-to-date"
          category="revenue"
          loading={loading}
        />
        <KpiCard
          title="Win/Loss Reason Logged"
          value={metrics?.winLossRate}
          subtitle="% of closed opps with reason populated"
          category="revenue"
          loading={loading}
        />
      </div>
    </div>
  );
}
