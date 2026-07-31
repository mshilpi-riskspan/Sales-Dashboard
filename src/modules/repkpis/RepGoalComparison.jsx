import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { getRepGoal } from '../../config/repGoals';

function formatM(v) {
  if (!v) return '$0';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${v}`;
}

function shortName(name) {
  const parts = (name || '').split(' ');
  return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : name;
}

export default function RepGoalComparison({ oppsYtd, repList }) {
  const data = useMemo(() => {
    return (repList || [])
      .map((r) => {
        const goal = getRepGoal(r.name);
        if (!goal) return null;
        const actual = (oppsYtd || [])
          .filter((o) => o.OwnerId === r.id && o.IsWon)
          .reduce((s, o) => s + (o.Annual_Recurring_Revenue_ARR__c ?? o.Amount ?? 0), 0);
        return {
          label: shortName(r.name),
          fullName: r.name,
          actual: Math.round(actual),
          goal,
          pct: Math.round((actual / goal) * 100),
        };
      })
      .filter(Boolean);
  }, [oppsYtd, repList]);

  if (data.length === 0) return null;

  const maxVal = Math.max(...data.map((d) => Math.max(d.actual, d.goal)), 1);

  return (
    <div className="rounded-card border border-rs-border bg-white p-4">
      <h3 className="text-sm font-semibold text-rs-text mb-0.5">Sales Goal Progress by Rep</h3>
      <p className="text-[11px] text-rs-muted mb-3">Closed ARR year-to-date vs each rep's annual target</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: 0 }} barCategoryGap="24%" barGap={4}>
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#858C9C' }} axisLine={false} tickLine={false} />
          <YAxis hide domain={[0, maxVal * 1.2]} />
          <Tooltip
            cursor={{ fill: 'rgba(12,142,163,0.06)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              return (
                <div className="bg-white border border-rs-border rounded-lg px-3 py-2 shadow-sm text-xs">
                  <p className="font-semibold text-rs-text mb-1">{d.fullName}</p>
                  <p className="text-rs-teal">Actual: {formatM(d.actual)}</p>
                  <p className="text-rs-muted">Goal: {formatM(d.goal)}</p>
                  <p className="text-rs-text font-semibold mt-1 border-t border-rs-border pt-1">{d.pct}% of goal</p>
                </div>
              );
            }}
          />
          <Bar dataKey="goal" fill="#DADEE5" radius={[2, 2, 0, 0]} name="Goal" />
          <Bar
            dataKey="actual"
            radius={[2, 2, 0, 0]}
            name="Actual"
            label={{ position: 'top', fontSize: 9, fill: '#858C9C', formatter: (v) => formatM(v) }}
          >
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.pct >= 100 ? '#22C55E' : entry.pct >= 75 ? '#FBBF24' : '#0C8EA3'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
