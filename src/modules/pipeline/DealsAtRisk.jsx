import { useState, useMemo } from 'react';
import { format, differenceInDays } from 'date-fns';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { fetchOpenOpportunities } from '../../datasources/salesforce';
import { useSalesforceQuery } from '../../hooks/useSalesforceQuery';
import { useRepFilter } from '../../hooks/useRepFilter';
import { STAGE_MAP } from '../../config/salesStages';
import DealDetailPanel from '../../components/common/DealDetailPanel';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorState from '../../components/common/ErrorState';
import { useDashboard } from '../../context/DashboardContext';

function formatARR(v) {
  if (!v && v !== 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

function classifyDeals(deals) {
  deals = deals.filter(d => d.Account?.Name && !d.IsClosed);
  const today = new Date();
  const pastCloseDate = [];
  const overdueInStage = [];
  const noNextStep = [];

  for (const deal of deals) {
    const stageConfig = STAGE_MAP[deal.StageName];
    const daysInStage = differenceInDays(today, new Date(deal.LastStageChangeDate || deal.CreatedDate));
    const isOverdue = stageConfig?.dayLimit && daysInStage > stageConfig.dayLimit;
    const isPastClose = deal.CloseDate && new Date(deal.CloseDate) < today;

    if (isPastClose) {
      pastCloseDate.push({ ...deal, _daysInStage: daysInStage, _daysOver: isOverdue ? daysInStage - stageConfig.dayLimit : 0 });
    } else if (isOverdue) {
      overdueInStage.push({ ...deal, _daysInStage: daysInStage, _daysOver: daysInStage - stageConfig.dayLimit });
    } else if (!deal.NextStep || !deal.NextStep.trim()) {
      noNextStep.push({ ...deal, _daysInStage: daysInStage, _daysOver: 0 });
    }
  }

  // Sort each category by urgency (most days over / oldest close date first)
  pastCloseDate.sort((a, b) => new Date(a.CloseDate) - new Date(b.CloseDate));
  overdueInStage.sort((a, b) => b._daysOver - a._daysOver);
  noNextStep.sort((a, b) => b._daysInStage - a._daysInStage);

  return { pastCloseDate, overdueInStage, noNextStep };
}

// ── Deal row ──────────────────────────────────────────────────────────────────
function RiskDealRow({ deal, onClick }) {
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
      <td className="px-3 py-2 text-sm whitespace-nowrap">
        {deal.CloseDate ? (
          <span className={new Date(deal.CloseDate) < new Date() ? 'text-red-600 font-medium' : 'text-rs-muted'}>
            {format(new Date(deal.CloseDate), 'MMM yyyy')}
          </span>
        ) : '—'}
      </td>
      <td className="px-3 py-2 text-sm text-rs-muted whitespace-nowrap">
        {deal._daysInStage}d
        {deal._daysOver > 0 && (
          <span className="ml-1.5 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full">
            +{deal._daysOver}d
          </span>
        )}
      </td>
    </tr>
  );
}

// ── Risk card ─────────────────────────────────────────────────────────────────
const RISK_CONFIG = {
  pastCloseDate: {
    label: 'Past Close Date',
    description: 'Open deals whose close date has already passed',
    headerBg: 'bg-red-50',
    dotCls: 'bg-red-500',
    accentCls: 'text-red-600',
    badgeCls: 'bg-red-100 text-red-600',
    emptyMsg: 'No deals past their close date',
  },
  overdueInStage: {
    label: 'Overdue in Stage',
    description: 'Deals stuck in a stage longer than the recommended time limit',
    headerBg: 'bg-amber-50',
    dotCls: 'bg-amber-500',
    accentCls: 'text-amber-700',
    badgeCls: 'bg-amber-100 text-amber-700',
    emptyMsg: 'No deals overdue in their current stage',
  },
  noNextStep: {
    label: 'No Next Step',
    description: 'Open deals with no documented next action in Salesforce',
    headerBg: 'bg-gray-50',
    dotCls: 'bg-gray-400',
    accentCls: 'text-rs-muted',
    badgeCls: 'bg-gray-100 text-rs-muted',
    emptyMsg: 'All deals have a next step documented',
  },
};

function RiskCard({ type, deals, onDealClick }) {
  const [expanded, setExpanded] = useState(true);
  const cfg = RISK_CONFIG[type];
  const totalArr = deals.reduce((s, d) => s + (d.Annual_Recurring_Revenue_ARR__c ?? d.Amount ?? 0), 0);

  return (
    <div className="rounded-card border border-rs-border bg-white overflow-hidden">
      <div className={`flex items-center justify-between px-4 py-3 border-b border-rs-border ${cfg.headerBg}`}>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${cfg.dotCls}`} />
          <div>
            <h3 className={`text-sm font-semibold ${cfg.accentCls}`}>{cfg.label}</h3>
            <p className="text-[10px] text-rs-muted mt-0.5">{cfg.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badgeCls}`}>
            {deals.length} deal{deals.length !== 1 ? 's' : ''}
          </span>
          {totalArr > 0 && (
            <span className="text-xs font-semibold text-rs-text">{formatARR(totalArr)}</span>
          )}
          <button onClick={() => setExpanded(e => !e)} className="text-rs-muted hover:text-rs-text transition-colors">
            {expanded ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        deals.length === 0 ? (
          <div className="px-4 py-5 text-center text-xs text-rs-muted">{cfg.emptyMsg}</div>
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
                <RiskDealRow key={deal.Id} deal={deal} onClick={onDealClick} />
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DealsAtRisk() {
  const { triggerRefresh } = useDashboard();
  const { data, loading, error } = useSalesforceQuery(fetchOpenOpportunities);
  const filtered = useRepFilter(data);
  const [activeDeal, setActiveDeal] = useState(null);

  const { pastCloseDate, overdueInStage, noNextStep } = useMemo(
    () => classifyDeals(filtered || []),
    [filtered]
  );

  const totalAtRisk = pastCloseDate.length + overdueInStage.length + noNextStep.length;
  const totalArr = [...pastCloseDate, ...overdueInStage, ...noNextStep]
    .reduce((s, d) => s + (d.Annual_Recurring_Revenue_ARR__c ?? d.Amount ?? 0), 0);

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
      {/* ── Overview card ───────────────────────────────────────────────── */}
      <div className="rounded-card border border-rs-border bg-white p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-rs-text">At-Risk Pipeline</h2>
            <p className="text-[11px] text-rs-muted mt-0.5">Live snapshot · open deals needing attention</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-rs-text">{totalAtRisk}</span>
            <span className="text-sm text-rs-muted">deals</span>
            <span className="w-px h-6 bg-rs-border mx-2" />
            <span className="text-2xl font-bold text-rs-teal">{formatARR(totalArr)}</span>
            <span className="text-sm text-rs-muted">at risk</span>
          </div>
        </div>

        {/* Category chips */}
        <div className="flex gap-3">
          <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-xs font-semibold text-red-600">{pastCloseDate.length}</span>
            <span className="text-xs text-rs-muted">Past Close Date</span>
          </div>
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-xs font-semibold text-amber-700">{overdueInStage.length}</span>
            <span className="text-xs text-rs-muted">Overdue in Stage</span>
          </div>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-gray-400" />
            <span className="text-xs font-semibold text-rs-muted">{noNextStep.length}</span>
            <span className="text-xs text-rs-muted">No Next Step</span>
          </div>
        </div>
      </div>

      {/* ── Three risk cards ─────────────────────────────────────────────── */}
      <div className="space-y-4">
        <RiskCard type="pastCloseDate" deals={pastCloseDate} onDealClick={setActiveDeal} />
        <RiskCard type="overdueInStage" deals={overdueInStage} onDealClick={setActiveDeal} />
        <RiskCard type="noNextStep" deals={noNextStep} onDealClick={setActiveDeal} />
      </div>

      <DealDetailPanel deal={activeDeal} onClose={() => setActiveDeal(null)} />
    </div>
  );
}
