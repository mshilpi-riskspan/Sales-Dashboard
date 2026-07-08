import { useState, useEffect, useMemo } from 'react';
import { format, differenceInDays, startOfMonth, subMonths, addMonths, getYear, getMonth, isSameMonth } from 'date-fns';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { fetchOpportunitiesClosingInYear } from '../../datasources/salesforce';
import { useRepFilter } from '../../hooks/useRepFilter';
import DealDetailPanel from '../../components/common/DealDetailPanel';
import PipelineListPanel from './PipelineListPanel';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorState from '../../components/common/ErrorState';
import { useDashboard } from '../../context/DashboardContext';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatARR(v) {
  if (!v && v !== 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

// ── Month bar chart ───────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border border-rs-border bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-rs-text">{label}</p>
      <p className="text-rs-muted">{payload[0].value} deal{payload[0].value !== 1 ? 's' : ''}</p>
      <p className="text-rs-teal">{formatARR(payload[0].payload.totalArr)}</p>
    </div>
  );
};

function MonthChart({ windowMonths }) {
  const now = new Date();
  const data = windowMonths.map(({ date, deals, totalArr }) => {
    const isPast = date < startOfMonth(now);
    const isCurrent = isSameMonth(date, now);
    // Show year on the label when it changes (e.g. Jan '27)
    const prevYear = date.getFullYear() !== windowMonths[0].date.getFullYear() &&
      date.getMonth() === 0;
    const label = prevYear
      ? `${MONTH_SHORT[date.getMonth()]} '${String(date.getFullYear()).slice(2)}`
      : MONTH_SHORT[date.getMonth()];
    return { name: label, count: deals.length, totalArr, isPast, isCurrent };
  });

  return (
    <ResponsiveContainer width="100%" height={120}>
      <BarChart data={data} layout="horizontal" margin={{ top: 18, right: 0, bottom: 0, left: 0 }}>
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: '#858C9C' }}
          axisLine={false}
          tickLine={false}
          interval={0}
        />
        <YAxis hide />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(12,142,163,0.08)' }} />
        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.isCurrent ? '#0C8EA3' : entry.isPast ? '#DADEE5' : '#1C2E59'}
            />
          ))}
          <LabelList
            dataKey="totalArr"
            position="top"
            formatter={v => v > 0 ? formatARR(v) : ''}
            style={{ fontSize: 10, fill: '#858C9C', fontWeight: 500 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Deal row ──────────────────────────────────────────────────────────────────
function MonthDealRow({ deal, onClick }) {
  const daysInStage = differenceInDays(
    new Date(),
    new Date(deal.LastStageChangeDate || deal.CreatedDate)
  );
  const arr = deal.Annual_Recurring_Revenue_ARR__c ?? deal.Amount ?? 0;

  return (
    <tr
      onClick={() => onClick(deal)}
      className="border-b border-rs-border hover:bg-rs-surface cursor-pointer transition-colors"
    >
      <td className="px-3 py-2">
        <span className="text-sm font-medium text-rs-text">{deal.Account?.Name || '—'}</span>
      </td>
      <td className="px-3 py-2">
        <span className="text-xs bg-rs-teal/10 text-rs-teal px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
          {deal.StageName}
        </span>
      </td>
      <td className="px-3 py-2 text-sm text-rs-muted">{deal.Owner?.Name || '—'}</td>
      <td className="px-3 py-2 text-sm font-medium text-rs-text">{formatARR(arr)}</td>
      <td className="px-3 py-2 text-sm text-rs-muted whitespace-nowrap">
        {deal.CloseDate ? format(new Date(deal.CloseDate), 'MMM d') : '—'}
      </td>
      <td className="px-3 py-2 text-sm text-rs-muted whitespace-nowrap">{daysInStage}d</td>
    </tr>
  );
}

// ── Month card ────────────────────────────────────────────────────────────────
function MonthCard({ monthDate, deals, onDealClick }) {
  const [expanded, setExpanded] = useState(true);

  const now = new Date();
  const isPast = monthDate < startOfMonth(now);
  const isCurrent = isSameMonth(monthDate, now);
  const monthName = format(monthDate, 'MMMM yyyy');

  const totalArr = deals.reduce((s, d) => s + (d.Annual_Recurring_Revenue_ARR__c ?? d.Amount ?? 0), 0);

  const headerBg = isCurrent ? 'bg-teal-50' : isPast ? 'bg-gray-50' : 'bg-rs-surface';
  const accentCls = isCurrent ? 'text-rs-teal' : isPast ? 'text-rs-muted' : 'text-rs-text';
  const dotCls = isCurrent ? 'bg-rs-teal' : isPast ? 'bg-gray-300' : 'bg-rs-navy';

  return (
    <div className="rounded-card border border-rs-border bg-white overflow-hidden">
      <div className={`flex items-center justify-between px-4 py-3 border-b border-rs-border ${headerBg}`}>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${dotCls}`} />
          <h3 className={`text-sm font-semibold ${accentCls}`}>
            {monthName}
            {isCurrent && <span className="ml-2 text-[10px] font-medium bg-rs-teal/10 text-rs-teal px-1.5 py-0.5 rounded-full">Current</span>}
          </h3>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-rs-muted font-medium">
            {deals.length} deal{deals.length !== 1 ? 's' : ''}
          </span>
          {totalArr > 0 && (
            <span className="text-xs font-semibold text-rs-text">{formatARR(totalArr)}</span>
          )}
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-rs-muted hover:text-rs-text transition-colors"
          >
            {expanded ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        deals.length === 0 ? (
          <div className="px-4 py-5 text-center text-xs text-rs-muted">No deals closing this month</div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                {['Account', 'Stage', 'AE Owner', 'ARR', 'Close Date', 'Days in Stage'].map(h => (
                  <th key={h} className="bg-rs-teal text-white px-3 py-2 text-left text-xs font-semibold tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deals.map(deal => (
                <MonthDealRow key={deal.Id} deal={deal} onClick={onDealClick} />
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  );
}

// Rolling window: 1 month prior + current + 11 ahead = 13 months
function buildWindow() {
  const windowStart = startOfMonth(subMonths(new Date(), 1));
  return Array.from({ length: 13 }, (_, i) => addMonths(windowStart, i));
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PipelineByMonth() {
  const { triggerRefresh, refreshCount } = useDashboard();
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeDeal, setActiveDeal] = useState(null);
  const [showAllDeals, setShowAllDeals] = useState(false);

  // Window is always computed fresh relative to today
  const windowDates = useMemo(() => buildWindow(), []);
  const windowYears = useMemo(() => [...new Set(windowDates.map(d => getYear(d)))], [windowDates]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all(windowYears.map(y => fetchOpportunitiesClosingInYear(y)))
      .then(results => setRawData(results.flat()))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [windowYears.join(','), refreshCount]);

  const filtered = useRepFilter(rawData);

  const windowMonths = useMemo(() => {
    return windowDates.map(date => {
      const slot = { date, deals: [], totalArr: 0 };
      if (!filtered) return slot;
      for (const deal of filtered) {
        if (!deal.CloseDate || !deal.Account?.Name) continue;
        const d = new Date(deal.CloseDate);
        if (getYear(d) === getYear(date) && getMonth(d) === getMonth(date)) {
          slot.deals.push(deal);
          slot.totalArr += deal.Annual_Recurring_Revenue_ARR__c ?? deal.Amount ?? 0;
        }
      }
      return slot;
    });
  }, [filtered, windowDates]);

  const totalDeals = windowMonths.reduce((s, m) => s + m.deals.length, 0);
  const totalArr = windowMonths.reduce((s, m) => s + m.totalArr, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={triggerRefresh} />;
  }

  return (
    <div>
      {/* ── Overview card ─────────────────────────────────────────────────── */}
      <div className="rounded-card border border-rs-border bg-white p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-rs-text">Monthly Close Overview</h2>
          <button
            onClick={() => setShowAllDeals(true)}
            className="flex gap-4 text-xs hover:opacity-80 transition-opacity"
          >
            <span className="text-rs-muted">
              <span className="font-bold text-rs-text text-sm underline decoration-dotted">{totalDeals}</span> deals
            </span>
            <span className="text-rs-muted">
              <span className="font-bold text-rs-teal text-sm underline decoration-dotted">{formatARR(totalArr)}</span> total ARR
            </span>
          </button>
        </div>
        <MonthChart windowMonths={windowMonths} />
      </div>

      {/* ── Month cards — 13 rolling months ───────────────────────────────── */}
      <div className="space-y-4">
        {windowMonths.map(({ date, deals }) => (
          <MonthCard
            key={`${getYear(date)}-${getMonth(date)}`}
            monthDate={date}
            deals={deals}
            onDealClick={setActiveDeal}
          />
        ))}
      </div>

      <PipelineListPanel
        deals={showAllDeals ? filtered : null}
        onClose={() => setShowAllDeals(false)}
        onDealClick={deal => { setShowAllDeals(false); setActiveDeal(deal); }}
      />
      <DealDetailPanel
        deal={activeDeal}
        onClose={() => setActiveDeal(null)}
      />
    </div>
  );
}
