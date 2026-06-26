import KpiCard from '../../components/common/KpiCard';

export default function ActivitySection({ metrics, loading, onDrill }) {
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
          onClick={onDrill ? () => onDrill('Outbound Emails', metrics?._emailTasks, 'tasks') : undefined}
        />
        <KpiCard
          title="Meetings / Month"
          value={metrics?.meetingsPerMonth}
          subtitle="Calendar meetings this quarter (excl. calls)"
          category="activity"
          loading={loading}
          onClick={onDrill ? () => onDrill('Meetings This Quarter', metrics?._meetingActivities, 'activities') : undefined}
        />
      </div>
    </div>
  );
}
