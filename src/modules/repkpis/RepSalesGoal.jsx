import { useMemo } from 'react';
import { getMonth } from 'date-fns';
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatM(v) {
  if (!v) return '$0';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${v}`;
}

function pct(actual, goal) {
  return goal > 0 ? Math.round((actual / goal) * 100) : 0;
}

function progressColor(p) {
  if (p >= 100) return 'bg-green-500';
  if (p >= 75) return 'bg-amber-400';
  return 'bg-rs-teal';
}

export default function RepSalesGoal({ repId, repName, oppsYtd, goal }) {
  const now = new Date();
  const curMonth = getMonth(now);

  const { actual, dealCount, cumulativeData } = useMemo(() => {
    const won = (oppsYtd || []).filter((o) => o.OwnerId === repId && o.IsWon);
    const actual = won.reduce((s, o) => s + (o.Annual_Recurring_Revenue_ARR__c ?? o.Amount ?? 0), 0);

    const monthlyArr = MONTHS.map((_, i) =>
      won
        .filter((o) => o.CloseDate && new Date(o.CloseDate + 'T00:00:00').getMonth() === i)
        .reduce((s, o) => s + (o.Annual_Recurring_Revenue_ARR__c ?? o.Amount ?? 0), 0)
    );

    let cum = 0;
    const cumulativeData = MONTHS.map((label, i) => {
      cum += monthlyArr[i];
      return {
        label,
        actual: i <= curMonth ? cum : null,
        goalPace: goal > 0 ? Math.round(((i + 1) / 12) * goal) : null,
      };
    });

    return { actual, dealCount: won.length, cumulativeData };
  }, [oppsYtd, repId, goal, curMonth]);

  const p = pct(actual, goal);
  const curMonthLabel = MONTHS[curMonth];

  return (
    <div className="rounded-card border border-rs-border bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-rs-border">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-sm font-semibold text-rs-text">{repName} — Annual Sales Goal</h2>
            <p className="text-[11px] text-rs-muted mt-0.5">Closed ARR year-to-date vs personal target</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-rs-text">
              {formatM(actual)} / {formatM(goal)}{' '}
              <span className={`font-semibold ${p >= 100 ? 'text-green-600' : p >= 75 ? 'text-amber-600' : 'text-rs-teal'}`}>
                ({p}%)
              </span>
            </p>
            <p className="text-[11px] text-rs-muted">{dealCount} deal{dealCount !== 1 ? 's' : ''} closed</p>
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-rs-border overflow-hidden">
          <div className={`h-full rounded-full transition-all ${progressColor(p)}`} style={{ width: `${Math.min(p, 100)}%` }} />
        </div>
      </div>

      <div className="px-4 py-4">
        <h3 className="text-sm font-semibold text-rs-text mb-0.5">Monthly Pace</h3>
        <p className="text-[11px] text-rs-muted mb-3">Cumulative actual vs even 1/12th-per-month goal pace</p>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={cumulativeData} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#858C9C' }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <ReferenceLine
              x={curMonthLabel}
              stroke="#0C8EA3"
              strokeDasharray="3 3"
              strokeOpacity={0.4}
              label={{ value: 'Today', position: 'top', fontSize: 9, fill: '#0C8EA3' }}
            />
            <Tooltip
              cursor={{ stroke: '#DADEE5', strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const a = payload.find((p) => p.dataKey === 'actual')?.value;
                const g = payload.find((p) => p.dataKey === 'goalPace')?.value;
                return (
                  <div className="bg-white border border-rs-border rounded-lg px-3 py-2 shadow-sm text-xs">
                    <p className="font-semibold text-rs-text mb-1">{label}</p>
                    {a != null && <p className="text-rs-teal">Actual: {formatM(a)}</p>}
                    {g != null && goal > 0 && <p className="text-rs-muted">Goal pace: {formatM(g)}</p>}
                  </div>
                );
              }}
            />
            {goal > 0 && (
              <Line dataKey="goalPace" stroke="#858C9C" strokeDasharray="5 5" strokeWidth={1.5} dot={false} connectNulls name="Goal Pace" />
            )}
            <Line dataKey="actual" stroke="#0C8EA3" strokeWidth={2.5} dot={false} connectNulls={false} name="Actual" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
