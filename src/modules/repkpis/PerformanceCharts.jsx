import { useMemo } from 'react';
import { getQuarter, getYear } from 'date-fns';
import {
  ComposedChart, BarChart, Bar, XAxis, YAxis, Tooltip,
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

const STAGE_SHORT = {
  'Initial Demo / SQL':               'Initial Demo',
  'Technical Fit Agreement':          'Tech Fit',
  'Proposal (pricing) Delivered':     'Proposal',
  'Trial':                            'Trial',
  'Negotiation & Decision Making':    'Negotiation',
  'Contract Sent for Signature':      'Contract',
};
const STAGE_ORDER = Object.keys(STAGE_SHORT);

export default function PerformanceCharts({ oppsYtd, lastYearOpps, openOpps, repId }) {
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

  // ── Active pipeline by stage ─────────────────────────────────────────────
  const pipelineByStage = useMemo(() => {
    const repOpen = filterRep(openOpps || []);
    return STAGE_ORDER.map((stage) => {
      const deals = repOpen.filter((o) => o.StageName === stage);
      return {
        label: STAGE_SHORT[stage],
        fullName: stage,
        arr: deals.reduce((s, o) => s + arrOrAmount(o), 0),
        count: deals.length,
      };
    });
  }, [openOpps, repId]);

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

      {/* Active Pipeline by Stage */}
      <div className="col-span-2 rounded-card border border-rs-border bg-white p-4">
        <h3 className="text-sm font-semibold text-rs-text mb-0.5">Active Pipeline by Stage</h3>
        <p className="text-[11px] text-rs-muted mb-3">Open deal ARR across the funnel</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={pipelineByStage} margin={{ top: 16, right: 8, bottom: 0, left: 0 }} barCategoryGap="24%">
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#858C9C' }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip
              cursor={{ fill: 'rgba(12,142,163,0.06)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-white border border-rs-border rounded-lg px-3 py-2 shadow-sm text-xs">
                    <p className="font-semibold text-rs-text mb-1">{d.fullName}</p>
                    <p className="text-rs-teal">{formatM(d.arr)} ARR</p>
                    <p className="text-rs-muted">{d.count} deal{d.count !== 1 ? 's' : ''}</p>
                  </div>
                );
              }}
            />
            <Bar dataKey="arr" radius={[3, 3, 0, 0]}
              label={{ position: 'top', fontSize: 9, fill: '#858C9C', formatter: (v) => v > 0 ? formatM(v) : '' }}>
              {pipelineByStage.map((entry, i) => (
                <Cell key={i} fill={entry.arr > 0 ? '#0C8EA3' : '#DADEE580'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
