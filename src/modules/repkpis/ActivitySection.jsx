import KpiCard from '../../components/common/KpiCard';

export default function ActivitySection({ metrics, loading, onDrill }) {
  const outboundPct = metrics ? Math.round((metrics.outboundPerWeekRaw / 10) * 100) : null;
  const meetingsPct = metrics ? Math.round((metrics.meetingsPerMonthRaw / 5) * 100) : null;

  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-widest text-rs-muted mb-3">Activity</h2>
      <div className="grid grid-cols-2 gap-4">
        <KpiCard
          title="Active Outreaches / Week"
          value={metrics?.outboundPerWeek}
          category="activity"
          loading={loading}
          goal={10}
          goalLabel="Goal: ≥10/week"
          goalPct={outboundPct}
          onClick={onDrill ? () => onDrill('Outbound Emails', metrics?._emailTasks, 'tasks') : undefined}
        />
        <KpiCard
          title="Meetings Booked / Month"
          value={metrics?.meetingsPerMonth}
          category="activity"
          loading={loading}
          goal={5}
          goalLabel="Goal: ≥5/month"
          goalPct={meetingsPct}
          onClick={onDrill ? () => onDrill('Meetings This Quarter', metrics?._meetingActivities, 'activities') : undefined}
        />
      </div>
    </div>
  );
}
