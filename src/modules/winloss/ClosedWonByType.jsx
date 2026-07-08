import { useState, useMemo } from 'react';
import { differenceInDays, format } from 'date-fns';
import { ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { fetchClosedOppsInYear } from '../../datasources/salesforce';
import { useSalesforceQuery } from '../../hooks/useSalesforceQuery';
import { useRepFilter } from '../../hooks/useRepFilter';
import DealDetailPanel from '../../components/common/DealDetailPanel';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorState from '../../components/common/ErrorState';
import { useDashboard } from '../../context/DashboardContext';

const DEAL_TYPES = ['New Account', 'Upsell', 'Cross-Sell'];

const TYPE_STYLE = {
  'New Account': {
    dot: 'bg-rs-teal',
    header: 'bg-rs-teal/5',
    accent: 'text-rs-teal',
    badge: 'bg-rs-teal/10 text-rs-teal',
  },
  'Upsell': {
    dot: 'bg-amber-400',
    header: 'bg-amber-50',
    accent: 'text-amber-700',
    badge: 'bg-amber-50 text-amber-700',
  },
  'Cross-Sell': {
    dot: 'bg-green-500',
    header: 'bg-green-50',
    accent: 'text-green-700',
    badge: 'bg-green-50 text-green-700',
  },
};

function formatARR(v) {
  if (!v && v !== 0) return '—';
  return `$${Math.round(v).toLocaleString()}`;
}

function StatChip({ label, value, accent = false }) {
  return (
    <div className="flex flex-col items-center px-5 py-3 border-r border-rs-border last:border-r-0">
      <span className={`text-lg font-bold ${accent ? 'text-rs-teal' : 'text-rs-text'}`}>{value}</span>
      <span className="text-[11px] text-rs-muted mt-0.5">{label}</span>
    </div>
  );
}

function GroupCard({ type, deals, onDealClick }) {
  const [expanded, setExpanded] = useState(true);
  const style = TYPE_STYLE[type] || TYPE_STYLE['New Account'];

  const totals = useMemo(() => ({
    arr: deals.reduce((s, d) => s + (d.Annual_Recurring_Revenue_ARR__c || 0), 0),
    tcv: deals.reduce((s, d) => s + (d.Amount || 0), 0),
    otf: deals.reduce((s, d) => s + (d.One_Time_Fees__c || 0), 0),
  }), [deals]);

  return (
    <div className="rounded-card border border-rs-border bg-white overflow-hidden">
      <div className={`flex items-center justify-between px-4 py-3 border-b border-rs-border ${style.header}`}>
        <div className="flex items-center gap-2.5">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${style.dot}`} />
          <h3 className={`text-sm font-semibold ${style.accent}`}>{type}</h3>
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${style.badge}`}>
            {deals.length} deal{deals.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-rs-muted font-medium">{formatARR(totals.arr)} ARR</span>
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
          <div className="px-4 py-8 text-center text-xs text-rs-muted">
            No {type} deals closed this year
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  {['Account', 'Opportunity', 'Module', 'Owner', 'ARR', 'Contract Value', 'OTF', 'Days to Close', 'Close Date'].map(h => (
                    <th key={h} className="bg-rs-teal text-white px-3 py-2 text-left text-xs font-semibold tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deals.map(deal => {
                  const daysToClose = deal.CloseDate && deal.CreatedDate
                    ? differenceInDays(new Date(deal.CloseDate + 'T00:00:00'), new Date(deal.CreatedDate))
                    : null;
                  return (
                    <tr
                      key={deal.Id}
                      onClick={() => onDealClick(deal)}
                      className="border-b border-rs-border hover:bg-rs-surface cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2 text-sm font-medium text-rs-text whitespace-nowrap">
                        {deal.Account?.Name || '—'}
                      </td>
                      <td className="px-3 py-2 text-sm text-rs-muted max-w-[200px] truncate">
                        {deal.Name}
                      </td>
                      <td className="px-3 py-2 text-xs text-rs-muted max-w-[160px] truncate">
                        {deal.Primary_Module__c || '—'}
                      </td>
                      <td className="px-3 py-2 text-sm text-rs-muted whitespace-nowrap">
                        {deal.Owner?.Name || '—'}
                      </td>
                      <td className="px-3 py-2 text-sm font-medium text-rs-text whitespace-nowrap">
                        {formatARR(deal.Annual_Recurring_Revenue_ARR__c)}
                      </td>
                      <td className="px-3 py-2 text-sm text-rs-text whitespace-nowrap">
                        {formatARR(deal.Amount)}
                      </td>
                      <td className="px-3 py-2 text-sm text-rs-muted whitespace-nowrap">
                        {deal.One_Time_Fees__c ? formatARR(deal.One_Time_Fees__c) : '—'}
                      </td>
                      <td className="px-3 py-2 text-sm text-rs-muted text-center whitespace-nowrap">
                        {daysToClose !== null ? daysToClose : '—'}
                      </td>
                      <td className="px-3 py-2 text-sm text-rs-muted whitespace-nowrap">
                        {deal.CloseDate ? format(new Date(deal.CloseDate + 'T00:00:00'), 'MMM d, yyyy') : '—'}
                      </td>
                    </tr>
                  );
                })}
                {/* Subtotal row */}
                <tr className="bg-rs-surface border-t-2 border-rs-border font-semibold">
                  <td className="px-3 py-2 text-xs text-rs-muted" colSpan={4}>Subtotal</td>
                  <td className="px-3 py-2 text-sm text-rs-text">{formatARR(totals.arr)}</td>
                  <td className="px-3 py-2 text-sm text-rs-text">{formatARR(totals.tcv)}</td>
                  <td className="px-3 py-2 text-sm text-rs-text">{totals.otf > 0 ? formatARR(totals.otf) : '—'}</td>
                  <td className="px-3 py-2" colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

export default function ClosedWonByType() {
  const { triggerRefresh } = useDashboard();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [activeDeal, setActiveDeal] = useState(null);

  const queryFn = useMemo(() => () => fetchClosedOppsInYear(selectedYear), [selectedYear]);
  const { data: rawData, loading, error } = useSalesforceQuery(queryFn);

  const filtered = useRepFilter(rawData);

  const { groups, summary } = useMemo(() => {
    const won = (filtered || []).filter(d => d.IsWon && DEAL_TYPES.includes(d.Type));
    const groups = Object.fromEntries(DEAL_TYPES.map(t => [t, won.filter(d => d.Type === t)]));
    const summary = {
      deals: won.length,
      arr: won.reduce((s, d) => s + (d.Annual_Recurring_Revenue_ARR__c || 0), 0),
      tcv: won.reduce((s, d) => s + (d.Amount || 0), 0),
      otf: won.reduce((s, d) => s + (d.One_Time_Fees__c || 0), 0),
    };
    return { groups, summary };
  }, [filtered]);

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
      {/* Summary + year selector */}
      <div className="rounded-card border border-rs-border bg-white mb-6 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-rs-border">
          <div>
            <h2 className="text-sm font-semibold text-rs-text">Closed Won — New vs Upsell vs Cross-Sell</h2>
            <p className="text-[11px] text-rs-muted mt-0.5">Platform deals closed this year by type</p>
          </div>
          <div className="flex items-center gap-1 border border-rs-border rounded-lg px-2 py-1">
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
        <div className="flex divide-x divide-rs-border">
          <StatChip label="Total Deals" value={summary.deals} />
          <StatChip label="Total ARR" value={formatARR(summary.arr)} accent />
          <StatChip label="Contract Value" value={formatARR(summary.tcv)} />
          <StatChip label="One-Time Fees" value={summary.otf > 0 ? formatARR(summary.otf) : '—'} />
        </div>
      </div>

      {/* Group cards */}
      <div className="space-y-4">
        {DEAL_TYPES.map(type => (
          <GroupCard
            key={type}
            type={type}
            deals={groups[type] || []}
            onDealClick={setActiveDeal}
          />
        ))}
      </div>

      {activeDeal && (
        <DealDetailPanel deal={activeDeal} onClose={() => setActiveDeal(null)} />
      )}
    </div>
  );
}
