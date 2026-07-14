import { useMemo } from 'react';
import { startOfQuarter, getQuarter, getYear, startOfWeek, differenceInWeeks } from 'date-fns';
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';

function arrOrAmount(o) {
  return o.Annual_Recurring_Revenue_ARR__c ?? o.Amount ?? 0;
}

function formatM(v) {
  if (!v) return '$0';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${v}`;
}

function getQuarterKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `Q${getQuarter(d)} '${String(getYear(d)).slice(2)}`;
}

export default function PerformanceCharts({ oppsYtd, lastYearOpps, tasks, repId }) {
  const now = new Date();
  const currentYear = getYear(now);
  const currentQtr = getQuarter(now);

  const filterRep = (arr) => repId ? (arr || []).filter((r) => r.OwnerId === repId) : (arr || []);

  // ── Quarterly ARR chart ──────────────────────────────────────────────────
  const quarterlyData = useMemo(() => {
    const wonThis = filterRep(oppsYtd).filter((o) => o.IsWon && o.CloseDate);
    const wonLast = filterRep(lastYearOpps).filter((o) => o.IsWon && o.CloseDate);

    const map = {};
    for (let q = 1; q <= 4; q++) {
      map[`Q${q} '${String(currentYear - 1).slice(2)}`] = { lastYear: 0, thisYear: 0 };
    }
    for (let q = 1; q <= 4; q++) {
      map[`Q${q} '${String(currentYear).slice(2)}`] = { lastYear: 0, thisYear: 0 };
    }

    wonLast.forEach((o) => {
      const key = getQuarterKey(o.CloseDate);
      if (map[key]) map[key].lastYear += arrOrAmount(o);
    });
    wonThis.forEach((o) => {
      const key = getQuarterKey(o.CloseDate);
      if (map[key]) map[key].thisYear += arrOrAmount(o);
    });

    return Object.entries(map).map(([label, v]) => ({
      label,
      lastYear: Math.round(v.lastYear),
      thisYear: Math.round(v.thisYear),
    }));
  }, [oppsYtd, lastYearOpps, repId, currentYear]);

  // ── Weekly outreach chart ────────────────────────────────────────────────
  const weeklyData = useMemo(() => {
    const emailTasks = filterRep(tasks).filter(
      (t) => t.Type === 'Email' || t.Subject?.toLowerCase().includes('outreach')
    );
    const qtrStart = startOfQuarter(now);
    const totalWeeks = Math.max(1, differenceInWeeks(now, qtrStart) + 1);

    const counts = Array.from({ length: totalWeeks }, () => 0);
    emailTasks.forEach((t) => {
      const d = new Date(t.CreatedDate);
      const wk = differenceInWeeks(d, qtrStart);
      if (wk >= 0 && wk < totalWeeks) counts[wk]++;
    });

    return counts.map((count, i) => ({ label: `Wk ${i + 1}`, count }));
  }, [tasks, repId]);

  const maxArr = Math.max(...quarterlyData.map((d) => Math.max(d.lastYear, d.thisYear)), 375000);

  return (
    <div className="grid grid-cols-5 gap-4">
      {/* Quarterly ARR Closed */}
      <div className="col-span-3 rounded-card border border-rs-border bg-white p-4">
        <h3 className="text-sm font-semibold text-rs-text mb-0.5">Quarterly ARR Closed</h3>
        <p className="text-[11px] text-rs-muted mb-3">Last year vs this year · $375K/quarter goal</p>
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={quarterlyData} margin={{ top: 16, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%">
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#858C9C' }} axisLine={false} tickLine={false} />
            <YAxis hide domain={[0, maxArr * 1.25]} />
            <ReferenceLine y={375000} stroke="#858C9C" strokeDasharray="4 4" strokeOpacity={0.7}
              label={{ value: '$375K', position: 'right', fontSize: 9, fill: '#858C9C' }} />
            <Tooltip
              cursor={{ fill: 'rgba(12,142,163,0.06)' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="bg-white border border-rs-border rounded-lg px-3 py-2 shadow-sm text-xs">
                    <p className="font-semibold text-rs-text mb-1">{label}</p>
                    {payload.find(p => p.dataKey === 'lastYear')?.value > 0 && (
                      <p className="text-rs-muted">Prior year: {formatM(payload.find(p => p.dataKey === 'lastYear').value)}</p>
                    )}
                    {payload.find(p => p.dataKey === 'thisYear')?.value > 0 && (
                      <p className="text-rs-teal font-medium">This year: {formatM(payload.find(p => p.dataKey === 'thisYear').value)}</p>
                    )}
                  </div>
                );
              }}
            />
            <Bar dataKey="lastYear" fill="#DADEE5" name="Last Year" radius={[2, 2, 0, 0]} />
            <Bar dataKey="thisYear" name="This Year" radius={[2, 2, 0, 0]}>
              {quarterlyData.map((entry, i) => {
                const qNum = parseInt(entry.label[1]);
                const isCurrentYear = entry.label.includes(`'${String(currentYear).slice(2)}`);
                const isFuture = isCurrentYear && qNum > currentQtr;
                return (
                  <Cell
                    key={i}
                    fill={isFuture ? '#0C8EA320' : isCurrentYear ? '#0C8EA3' : '#DADEE5'}
                  />
                );
              })}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Weekly Outreach */}
      <div className="col-span-2 rounded-card border border-rs-border bg-white p-4">
        <h3 className="text-sm font-semibold text-rs-text mb-0.5">Weekly Outreach Activity</h3>
        <p className="text-[11px] text-rs-muted mb-3">Emails + outreach tasks · goal: 10/week</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={weeklyData} margin={{ top: 16, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#858C9C' }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <ReferenceLine y={10} stroke="#858C9C" strokeDasharray="4 4" strokeOpacity={0.7}
              label={{ value: '10', position: 'right', fontSize: 9, fill: '#858C9C' }} />
            <Tooltip
              cursor={{ fill: 'rgba(12,142,163,0.06)' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const v = payload[0].value;
                return (
                  <div className="bg-white border border-rs-border rounded-lg px-3 py-2 shadow-sm text-xs">
                    <p className="font-semibold text-rs-text">{label}</p>
                    <p className={v >= 10 ? 'text-green-600' : v >= 7 ? 'text-amber-600' : 'text-red-500'}>
                      {v} outreach{v !== 1 ? 'es' : ''}
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey="count" radius={[3, 3, 0, 0]}>
              {weeklyData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.count >= 10 ? '#22C55E' : entry.count >= 7 ? '#FBBF24' : '#0C8EA380'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
