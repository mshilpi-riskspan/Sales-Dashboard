import { useMemo, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatARR(v) {
  if (!v && v !== 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const churn = payload.find(p => p.dataKey === 'churnArr')?.value || 0;
  const totalArr = payload.find(p => p.dataKey === 'totalArr')?.value || 0;
  const deals = payload.find(p => p.dataKey === 'churnArr')?.payload?.deals || 0;
  return (
    <div className="rounded border border-rs-border bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-rs-text mb-1">{label}</p>
      <p className="text-red-500">Churned: {formatARR(churn)}{deals > 0 ? ` (${deals} deal${deals !== 1 ? 's' : ''})` : ''}</p>
      {totalArr > 0 && <p className="text-rs-teal">Total ARR: {formatARR(totalArr)}</p>}
      {totalArr > 0 && churn > 0 && (
        <p className="text-rs-muted mt-1">{((churn / totalArr) * 100).toFixed(1)}% churn rate</p>
      )}
    </div>
  );
};

export default function ChurnRateChart({ churnedOpps, arrSeries }) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  // Build monthly churn from SF closed-lost opps bucketed by CloseDate
  const chartData = useMemo(() => {
    const buckets = MONTHS.map((month, i) => ({
      label: month,
      monthIndex: i,
      churnArr: 0,
      deals: 0,
      totalArr: 0,
    }));

    for (const opp of churnedOpps) {
      if (!opp.CloseDate) continue;
      const d = new Date(opp.CloseDate + 'T00:00:00');
      if (d.getFullYear() !== selectedYear) continue;
      const mi = d.getMonth();
      const arr = Number(opp.Annual_Recurring_Revenue_ARR__c ?? opp.Amount ?? 0);
      buckets[mi].churnArr += arr;
      buckets[mi].deals += 1;
    }

    // Overlay Maxio ARR trend for selected year (arrSeries label = "Mon 'YY")
    const arrByMonth = new Map();
    for (const s of arrSeries) {
      const parts = s.label.split(' ');
      if (parts.length < 2) continue;
      const mon = parts[0];
      const yr = 2000 + parseInt(parts[1].replace("'", ''), 10);
      if (yr === selectedYear) {
        const mi = MONTHS.indexOf(mon);
        if (mi >= 0) arrByMonth.set(mi, s.arr);
      }
    }
    for (const b of buckets) {
      if (arrByMonth.has(b.monthIndex)) b.totalArr = arrByMonth.get(b.monthIndex);
    }

    return buckets;
  }, [churnedOpps, arrSeries, selectedYear]);

  const totalChurnedYear = chartData.reduce((s, b) => s + b.churnArr, 0);
  const totalDealsYear = chartData.reduce((s, b) => s + b.deals, 0);

  return (
    <div className="rounded-card border border-rs-border bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-rs-border">
        <div>
          <h3 className="text-sm font-semibold text-rs-text">ARR Trend & Churn</h3>
          {totalDealsYear > 0 && (
            <p className="text-[10px] text-rs-muted mt-0.5">
              {selectedYear}: {formatARR(totalChurnedYear)} churned · {totalDealsYear} deal{totalDealsYear !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSelectedYear(y => y - 1)}
            className="text-rs-muted hover:text-rs-text transition-colors p-0.5"
          >
            <ChevronLeftIcon className="h-3.5 w-3.5" />
          </button>
          <span className="text-sm font-semibold text-rs-text w-12 text-center">{selectedYear}</span>
          <button
            onClick={() => setSelectedYear(y => y + 1)}
            className="text-rs-muted hover:text-rs-text transition-colors p-0.5"
          >
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="px-4 py-4">
        <div className="flex gap-4 mb-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm bg-red-400 inline-block" />
            <span className="text-rs-muted">Churned ARR</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-rs-teal inline-block" />
            <span className="text-rs-muted">Total ARR</span>
          </span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EAECF0" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#858C9C' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="arr"
              orientation="right"
              tick={{ fontSize: 10, fill: '#858C9C' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `$${(v / 1_000).toFixed(0)}K` : `$${v}`}
            />
            <YAxis
              yAxisId="churn"
              orientation="left"
              tick={{ fontSize: 10, fill: '#858C9C' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `$${(v / 1_000).toFixed(0)}K` : `$${v}`}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(12,142,163,0.06)' }} />
            <Bar yAxisId="churn" dataKey="churnArr" name="Churned ARR" fill="#F87171" radius={[3, 3, 0, 0]} maxBarSize={32} />
            <Line yAxisId="arr" dataKey="totalArr" name="Total ARR" stroke="#0C8EA3" strokeWidth={2} dot={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
