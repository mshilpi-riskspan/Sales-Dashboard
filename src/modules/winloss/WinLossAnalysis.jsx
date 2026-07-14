import { useState, useEffect, useMemo } from 'react';
import { format, differenceInDays } from 'date-fns';
import { ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { fetchClosedOppsInYear, fetchRecentlyLost } from '../../datasources/salesforce';
import { useRepFilter } from '../../hooks/useRepFilter';
import DealDetailPanel from '../../components/common/DealDetailPanel';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorState from '../../components/common/ErrorState';
import { useDashboard } from '../../context/DashboardContext';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatARR(v) {
  if (!v && v !== 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

function pct(a, b) {
  if (!b) return null;
  return Math.round((a / b) * 100);
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const won = payload.find(p => p.dataKey === 'won')?.value || 0;
  const lost = payload.find(p => p.dataKey === 'lost')?.value || 0;
  const total = won + lost;
  return (
    <div className="rounded border border-rs-border bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-rs-text mb-1">{label}</p>
      <p className="text-rs-teal">Won: {won}</p>
      <p className="text-rs-muted">Lost: {lost}</p>
      {total > 0 && <p className="text-rs-text font-medium mt-1">{pct(won, total)}% win rate</p>}
    </div>
  );
};

// ── Month grouped bar chart ───────────────────────────────────────────────────
function WinLossChart({ monthData }) {
  const data = MONTH_SHORT.map((name, i) => ({
    name,
    won: monthData[i].won.length,
    lost: monthData[i].lost.length,
  }));

  return (
    <ResponsiveContainer width="100%" height={130}>
      <BarChart data={data} layout="horizontal" margin={{ top: 10, right: 0, bottom: 0, left: 0 }} barCategoryGap="20%">
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: '#858C9C' }}
          axisLine={false}
          tickLine={false}
          interval={0}
        />
        <YAxis hide />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(12,142,163,0.06)' }} />
        <Bar dataKey="won" name="Won" stackId={null} radius={[3, 3, 0, 0]} fill="#0C8EA3" maxBarSize={18} />
        <Bar dataKey="lost" name="Lost" stackId={null} radius={[3, 3, 0, 0]} fill="#DADEE5" maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Rep breakdown table ───────────────────────────────────────────────────────
function RepTable({ repRows }) {
  if (!repRows.length) return null;
  return (
    <div className="rounded-card border border-rs-border bg-white overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-rs-border">
        <h3 className="text-sm font-semibold text-rs-text">Rep Breakdown</h3>
      </div>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {['Rep', 'Won', 'Lost', 'Win Rate', 'ARR Won', 'ARR Lost'].map(h => (
              <th key={h} className="bg-rs-teal text-white px-3 py-2 text-left text-xs font-semibold tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {repRows.map(r => (
            <tr key={r.ownerId} className="border-b border-rs-border hover:bg-rs-surface transition-colors">
              <td className="px-3 py-2 font-medium text-rs-text">{r.name}</td>
              <td className="px-3 py-2 text-green-700 font-medium">{r.won}</td>
              <td className="px-3 py-2 text-rs-muted">{r.lost}</td>
              <td className="px-3 py-2">
                {r.winRate !== null ? (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    r.winRate >= 50 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                  }`}>
                    {r.winRate}%
                  </span>
                ) : '—'}
              </td>
              <td className="px-3 py-2 text-rs-text font-medium">{formatARR(r.arrWon)}</td>
              <td className="px-3 py-2 text-rs-muted">{formatARR(r.arrLost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Loss reason breakdown ─────────────────────────────────────────────────────
function LossReasonBreakdown({ lost }) {
  const reasonCounts = useMemo(() => {
    const map = new Map();
    for (const d of lost) {
      const reason = d.Loss_Reason__c || 'Not Specified';
      map.set(reason, (map.get(reason) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  }, [lost]);

  if (!lost.length) return null;
  const max = reasonCounts[0]?.count || 1;

  return (
    <div className="rounded-card border border-rs-border bg-white overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-rs-border">
        <h3 className="text-sm font-semibold text-rs-text">Loss Reasons</h3>
      </div>
      <div className="px-4 py-3 space-y-2.5">
        {reasonCounts.map(({ reason, count }) => (
          <div key={reason} className="flex items-center gap-3">
            <span className="text-xs text-rs-muted w-36 shrink-0 truncate" title={reason}>{reason}</span>
            <div className="flex-1 bg-rs-surface rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-red-400 rounded-full transition-all"
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-rs-text w-6 text-right shrink-0">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Deal list ─────────────────────────────────────────────────────────────────
function DealRow({ deal, onClick }) {
  const arr = deal.Annual_Recurring_Revenue_ARR__c ?? deal.Amount ?? 0;
  const isWon = deal.IsWon;
  const reason = isWon ? deal.Won_Reason__c : deal.Loss_Reason__c;
  return (
    <tr
      onClick={() => onClick(deal)}
      className="border-b border-rs-border hover:bg-rs-surface cursor-pointer transition-colors"
    >
      <td className="px-3 py-2">
        <span className="text-sm font-medium text-rs-text">{deal.Account?.Name || '—'}</span>
      </td>
      <td className="px-3 py-2">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
          isWon ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
        }`}>
          {isWon ? 'Won' : 'Lost'}
        </span>
      </td>
      <td className="px-3 py-2 text-sm text-rs-muted">{deal.Owner?.Name || '—'}</td>
      <td className="px-3 py-2 text-sm font-medium text-rs-text">{formatARR(arr)}</td>
      <td className="px-3 py-2 text-sm text-rs-muted whitespace-nowrap">
        {deal.CloseDate ? format(new Date(deal.CloseDate + 'T00:00:00'), 'MMM d') : '—'}
      </td>
      <td className="px-3 py-2 text-xs text-rs-muted">{reason || '—'}</td>
      <td className="px-3 py-2 text-xs text-rs-muted max-w-xs">
        {deal.Closed_Lost_Reason_Explanation__c ? (
          <span className="line-clamp-2" title={deal.Closed_Lost_Reason_Explanation__c}>
            {deal.Closed_Lost_Reason_Explanation__c}
          </span>
        ) : '—'}
      </td>
    </tr>
  );
}

// ── Recently lost section ─────────────────────────────────────────────────────
function RecentlyLost({ deals = [], onDealClick }) {
  const [expanded, setExpanded] = useState(true);
  const totalArr = deals.reduce((s, d) => s + (d.Annual_Recurring_Revenue_ARR__c ?? d.Amount ?? 0), 0);

  return (
    <div className="rounded-card border border-red-200 bg-white overflow-hidden mb-6">
      <div className="flex items-center justify-between px-4 py-3 border-b border-red-100 bg-red-50">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <div>
            <h3 className="text-sm font-semibold text-red-700">Lost in Last 30 Days</h3>
            <p className="text-[10px] text-rs-muted mt-0.5">Deals marked Closed Lost in the past 30 days</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
            {deals.length} deal{deals.length !== 1 ? 's' : ''}
          </span>
          {totalArr > 0 && (
            <span className="text-xs font-semibold text-rs-text">{formatARR(totalArr)}</span>
          )}
          <button onClick={() => setExpanded(e => !e)} className="text-rs-muted hover:text-rs-text transition-colors">
            {expanded
              ? <ChevronUpIcon className="h-4 w-4" />
              : <ChevronDownIcon className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {expanded && (
        deals.length === 0 ? (
          <div className="px-4 py-5 text-center text-xs text-rs-muted">No deals lost in the last 30 days</div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                {['Account', 'AE Owner', 'Type', 'ARR', 'Marked Lost', 'Loss Reason', 'Explanation'].map(h => (
                  <th key={h} className="bg-red-600 text-white px-3 py-2 text-left text-xs font-semibold tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deals.map(deal => {
                const arr = deal.Annual_Recurring_Revenue_ARR__c ?? deal.Amount ?? 0;
                return (
                  <tr
                    key={deal.Id}
                    onClick={() => onDealClick(deal)}
                    className="border-b border-rs-border hover:bg-rs-surface cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2 font-medium text-rs-text">{deal.Account?.Name || '—'}</td>
                    <td className="px-3 py-2 text-rs-muted">{deal.Owner?.Name || '—'}</td>
                    <td className="px-3 py-2">
                      {deal.Type ? (
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${
                          deal.Type === 'New Account' ? 'bg-rs-teal/10 text-rs-teal' :
                          deal.Type === 'Upsell'      ? 'bg-amber-50 text-amber-700' :
                          deal.Type === 'Cross-Sell'  ? 'bg-green-50 text-green-700' :
                          deal.Type === 'Renewal'     ? 'bg-purple-50 text-purple-600' :
                          'bg-rs-surface text-rs-muted'
                        }`}>{deal.Type}</span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 font-semibold text-rs-text">{formatARR(arr)}</td>
                    <td className="px-3 py-2 text-rs-muted whitespace-nowrap">
                      {deal.LastStageChangeDate ? format(new Date(deal.LastStageChangeDate.slice(0, 10) + 'T00:00:00'), 'MMM d') : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-rs-muted">{deal.Loss_Reason__c || '—'}</td>
                    <td className="px-3 py-2 text-xs text-rs-muted max-w-xs">
                      {deal.Closed_Lost_Reason_Explanation__c
                        ? <span className="line-clamp-2" title={deal.Closed_Lost_Reason_Explanation__c}>{deal.Closed_Lost_Reason_Explanation__c}</span>
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function WinLossAnalysis() {
  const { triggerRefresh, refreshCount } = useDashboard();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeDeal, setActiveDeal] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [recentLostRaw, setRecentLostRaw] = useState([]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchClosedOppsInYear(selectedYear)
      .then(setRawData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedYear, refreshCount]);

  useEffect(() => {
    fetchRecentlyLost().then(setRecentLostRaw).catch(() => {});
  }, [refreshCount]);

  const filtered = useRepFilter(rawData);

  const { won, lost, monthData, repRows } = useMemo(() => {
    const won = filtered.filter(d => d.IsWon);
    const lost = filtered.filter(d => !d.IsWon);

    const monthData = Array.from({ length: 12 }, () => ({ won: [], lost: [] }));
    for (const d of filtered) {
      if (!d.CloseDate) continue;
      const m = new Date(d.CloseDate + 'T00:00:00').getMonth();
      if (d.IsWon) monthData[m].won.push(d);
      else monthData[m].lost.push(d);
    }

    const repMap = new Map();
    for (const d of filtered) {
      if (!d.OwnerId) continue;
      if (!repMap.has(d.OwnerId)) {
        repMap.set(d.OwnerId, { ownerId: d.OwnerId, name: d.Owner?.Name || d.OwnerId, won: 0, lost: 0, arrWon: 0, arrLost: 0 });
      }
      const r = repMap.get(d.OwnerId);
      const arr = d.Annual_Recurring_Revenue_ARR__c ?? d.Amount ?? 0;
      if (d.IsWon) { r.won++; r.arrWon += arr; }
      else { r.lost++; r.arrLost += arr; }
    }
    const repRows = Array.from(repMap.values())
      .map(r => ({ ...r, winRate: pct(r.won, r.won + r.lost) }))
      .sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1));

    return { won, lost, monthData, repRows };
  }, [filtered]);

  const filteredRecentLost = useRepFilter(recentLostRaw);
  const recentLost = useMemo(() => (
    [...(filteredRecentLost || [])].sort((a, b) => new Date(b.LastStageChangeDate) - new Date(a.LastStageChangeDate))
  ), [filteredRecentLost]);

  const totalArr = won.reduce((s, d) => s + (d.Annual_Recurring_Revenue_ARR__c ?? d.Amount ?? 0), 0);
  const winRate = pct(won.length, won.length + lost.length);

  const dealList = useMemo(() => {
    if (activeTab === 'won') return won;
    if (activeTab === 'lost') return lost;
    return filtered;
  }, [activeTab, filtered, won, lost]);

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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-rs-text">Win / Loss Overview</h2>
          <div className="flex items-center gap-1 border border-rs-border rounded-lg px-2 py-1">
            <button onClick={() => setSelectedYear(y => y - 1)} className="text-rs-muted hover:text-rs-text transition-colors p-0.5">
              <ChevronLeftIcon className="h-3.5 w-3.5" />
            </button>
            <span className="text-sm font-semibold text-rs-text w-12 text-center">{selectedYear}</span>
            <button onClick={() => setSelectedYear(y => y + 1)} className="text-rs-muted hover:text-rs-text transition-colors p-0.5">
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* KPI chips */}
        <div className="flex items-center gap-6 mb-4">
          <div>
            <p className="text-[10px] text-rs-muted uppercase tracking-wide font-medium">Win Rate</p>
            <p className="text-2xl font-bold text-rs-text">{winRate !== null ? `${winRate}%` : '—'}</p>
          </div>
          <div className="w-px h-8 bg-rs-border" />
          <div>
            <p className="text-[10px] text-rs-muted uppercase tracking-wide font-medium">ARR Won</p>
            <p className="text-2xl font-bold text-rs-teal">{formatARR(totalArr)}</p>
          </div>
          <div className="w-px h-8 bg-rs-border" />
          <div>
            <p className="text-[10px] text-rs-muted uppercase tracking-wide font-medium">Deals Won</p>
            <p className="text-2xl font-bold text-green-700">{won.length}</p>
          </div>
          <div className="w-px h-8 bg-rs-border" />
          <div>
            <p className="text-[10px] text-rs-muted uppercase tracking-wide font-medium">Deals Lost</p>
            <p className="text-2xl font-bold text-red-500">{lost.length}</p>
          </div>
          {/* Chart legend */}
          <div className="ml-auto flex items-center gap-4 text-xs text-rs-muted">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rs-teal inline-block" /> Won</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#DADEE5] inline-block" /> Lost</span>
          </div>
        </div>

        <WinLossChart monthData={monthData} />
      </div>

      {/* ── Rep breakdown ──────────────────────────────────────────────────── */}
      <RepTable repRows={repRows} />

      {/* ── Loss reason breakdown ──────────────────────────────────────────── */}
      <LossReasonBreakdown lost={lost} />

      {/* ── Recently lost ──────────────────────────────────────────────────── */}
      <RecentlyLost deals={recentLost} onDealClick={setActiveDeal} />

      {/* ── Deal list ──────────────────────────────────────────────────────── */}
      <div className="rounded-card border border-rs-border bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-rs-border">
          <h3 className="text-sm font-semibold text-rs-text">Closed Deals</h3>
          <div className="flex gap-1">
            {[['all', 'All'], ['won', 'Won'], ['lost', 'Lost']].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setActiveTab(val)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  activeTab === val
                    ? 'bg-rs-teal text-white'
                    : 'text-rs-muted hover:text-rs-text hover:bg-rs-surface'
                }`}
              >
                {label} {val === 'all' ? filtered.length : val === 'won' ? won.length : lost.length}
              </button>
            ))}
          </div>
        </div>

        {dealList.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-rs-muted">No deals to show</div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                {['Account', 'Outcome', 'AE Owner', 'ARR', 'Close Date', 'Reason', 'Explanation'].map(h => (
                  <th key={h} className="bg-rs-teal text-white px-3 py-2 text-left text-xs font-semibold tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dealList.map(deal => (
                <DealRow key={deal.Id} deal={deal} onClick={setActiveDeal} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <DealDetailPanel deal={activeDeal} onClose={() => setActiveDeal(null)} />
    </div>
  );
}
