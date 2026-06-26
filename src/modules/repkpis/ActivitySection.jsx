import KpiCard from '../../components/common/KpiCard';

export default function ActivitySection({ metrics, loading }) {
  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-widest text-rs-muted mb-3">Activity</h2>
      <div className="grid grid-cols-2 gap-4">
        <KpiCard
          title="Outbound Emails / Week"
          value={metrics?.outboundPerWeek}
          subtitle="Tasks: Type=Email or Subject contains outreach"
          category="activity"
          loading={loading}
        />
        <KpiCard
          title="Meetings / Month"
          value={metrics?.meetingsPerMonth}
          subtitle="Meeting/Call tasks + events this quarter"
          category="activity"
          loading={loading}
        />
      </div>
    </div>
  );
}
