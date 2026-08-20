import { useMemo, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

function formatARR(v) {
  if (!v && v !== 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="rounded border border-rs-border bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-rs-text mb-1">{label}</p>
      <p className="text-rs-teal">Renewal ARR: {formatARR(d?.arr)}</p>
      <p className="text-rs-muted">{d?.count} client{d?.count !== 1 ? 's' : ''}</p>
    </div>
  );
};

// Buckets SF open renewal opps by CloseDate month/quarter for the selected year.
// Uses Annual_Recurring_Revenue_ARR__c (SF field) so numbers match the slide/board reports.
export default function RenewalCalendarChart({ sfOpps }) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [view, setView] = useState('monthly');

  const chartData = useMemo(() => {
    if (view === 'monthly') {
      const buckets = MONTHS.map((label, i) => ({ label, monthIndex: i, arr: 0, count: 0 }));
      for (const opp of sfOpps) {
        if (!opp.CloseDate) continue;
        const d = new Date(opp.CloseDate + 'T00:00:00');
        if (d.getFullYear() !== selectedYear) continue;
        const arr = Number(opp.Annual_Recurring_Revenue_ARR__c ?? opp.Amount ?? 0);
        buckets[d.getMonth()].arr += arr;
        buckets[d.getMonth()].count += 1;
      }
      return buckets;
    } else {
      const buckets = QUARTERS.map((label, i) => ({ label, quarterIndex: i, arr: 0, count: 0 }));
      for (const opp of sfOpps) {
        if (!opp.CloseDate) continue;
        const d = new Date(opp.CloseDate + 'T00:00:00');
        if (d.getFullYear() !== selectedYear) continue;
        const arr = Number(opp.Annual_Recurring_Revenue_ARR__c ?? opp.Amount ?? 0);
        const qi = Math.floor(d.getMonth() / 3);
        buckets[qi].arr += arr;
        buckets[qi].count += 1;
      }
      return buckets;
    }
  }, [sfOpps, selectedYear, view]);

  const totalYear = chartData.reduce((s, b) => s + b.arr, 0);
  const totalClients = chartData.reduce((s, b) => s + b.count, 0);

  function isCurrentBucket(b) {
    if (selectedYear !== currentYear) return false;
    if (view === 'monthly') return b.monthIndex === currentMonth;
    return b.quarterIndex === Math.floor(currentMonth / 3);
  }

  return (
    <div className="rounded-card border border-rs-border bg-white overflow-hidden mb-6">
      <div className="flex items-center justify-between px-4 py-3 border-b border-rs-border">
        <div>
          <h3 className="text-sm font-semibold text-rs-text">Renewal Calendar</h3>
          {totalClients > 0 && (
            <p className="text-[10px] text-rs-muted mt-0.5">
              {selectedYear}: {formatARR(totalYear)} · {totalClients} renewal{totalClients !== 1 ? 's' : ''} · Salesforce ARR
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {[['monthly', 'Monthly'], ['quarterly', 'Quarterly']].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setView(val)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  view === val
                    ? 'bg-rs-teal text-white'
                    : 'text-rs-muted hover:text-rs-text hover:bg-rs-surface'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setSelectedYear(y => y - 1)} className="text-rs-muted hover:text-rs-text transition-colors p-0.5">
              <ChevronLeftIcon className="h-3.5 w-3.5" />
            </button>
            <span className="text-sm font-semibold text-rs-text w-12 text-center">{selectedYear}</span>
            <button onClick={() => setSelectedYear(y => y + 1)} className="text-rs-muted hover:text-rs-text transition-colors p-0.5">
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
      <div className="px-4 py-4">
        {totalClients === 0 ? (
          <p className="text-center text-xs text-rs-muted py-10">No open renewal opportunities in {selectedYear}</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EAECF0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#858C9C' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 10, fill: '#858C9C' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `$${(v / 1_000).toFixed(0)}K` : `$${v}`}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(12,142,163,0.06)' }} />
              <Bar dataKey="arr" radius={[4, 4, 0, 0]} maxBarSize={48}>
                {chartData.map((b, i) => (
                  <Cell
                    key={i}
                    fill={isCurrentBucket(b) ? '#0C8EA3' : b.arr > 0 ? '#5BB8C9' : '#E5E7EB'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        {totalClients > 0 && (
          <div className="flex gap-4 mt-2 text-[10px] text-rs-muted">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-2 rounded-sm bg-rs-teal inline-block" />
              Current {view === 'monthly' ? 'month' : 'quarter'}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-2 rounded-sm bg-[#5BB8C9] inline-block" />
              Upcoming
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
