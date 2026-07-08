import { useMemo, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { format, startOfMonth, endOfYear, addMonths, getMonth, getYear } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useSalesforceQuery } from '../../hooks/useSalesforceQuery';
import { useRepFilter } from '../../hooks/useRepFilter';
import { fetchOpenOpportunities, fetchClosedOppsInYear } from '../../datasources/salesforce';
import { SALES_STAGES } from '../../config/salesStages';
import FunnelSummary from './FunnelSummary';
import StageCard from './StageCard';
import PipelineListPanel from './PipelineListPanel';
import DealDetailPanel from '../../components/common/DealDetailPanel';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorState from '../../components/common/ErrorState';
import { useDashboard } from '../../context/DashboardContext';

function formatARR(v) {
  if (!v) return '$0';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${v}`;
}

function PipelineByMonthMini({ deals }) {
  const now = new Date();
  const thisMonth = startOfMonth(now);
  const yearEnd = endOfYear(now);

  const months = [];
  let cursor = thisMonth;
  while (cursor <= yearEnd) {
    months.push(cursor);
    cursor = addMonths(cursor, 1);
  }

  const data = months.map((monthDate) => {
    const m = getMonth(monthDate);
    const y = getYear(monthDate);
    const monthDeals = (deals || []).filter((d) => {
      if (!d.CloseDate) return false;
      const cd = new Date(d.CloseDate + 'T00:00:00');
      return getMonth(cd) === m && getYear(cd) === y;
    });
    const arr = monthDeals.reduce((s, d) => s + (d.Annual_Recurring_Revenue_ARR__c ?? d.Amount ?? 0), 0);
    return { label: format(monthDate, 'MMM'), arr, count: monthDeals.length };
  });

  const maxArr = Math.max(...data.map((d) => d.arr), 1);
  const todayMonth = getMonth(now);

  return (
    <div className="rounded-card border border-rs-border bg-white p-4 mb-4">
      <h3 className="text-sm font-semibold text-rs-text mb-1">Pipeline Close Schedule</h3>
      <p className="text-[11px] text-rs-muted mb-3">Open deals by expected close month · {new Date().getFullYear()}</p>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={data} margin={{ top: 16, right: 4, left: 0, bottom: 0 }} barCategoryGap="28%">
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#858C9C' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide domain={[0, maxArr * 1.25]} />
          <Tooltip
            cursor={{ fill: 'rgba(12,142,163,0.06)' }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              return (
                <div className="bg-white border border-rs-border rounded-lg px-3 py-2 shadow-sm text-xs">
                  <p className="font-semibold text-rs-text">{label}</p>
                  <p className="text-rs-teal">{formatARR(d.arr)} ARR</p>
                  <p className="text-rs-muted">{d.count} deal{d.count !== 1 ? 's' : ''}</p>
                </div>
              );
            }}
          />
          <Bar dataKey="arr" radius={[3, 3, 0, 0]} label={{ position: 'top', fontSize: 10, fill: '#858C9C', formatter: (v) => v > 0 ? formatARR(v) : '' }}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={getMonth(months[i]) === todayMonth ? '#0C8EA3' : '#0C8EA380'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function PipelineByStage() {
  const { triggerRefresh } = useDashboard();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const { data: openData, loading: openLoading, error: openError } = useSalesforceQuery(fetchOpenOpportunities);
  const closedQueryFn = useMemo(() => () => fetchClosedOppsInYear(selectedYear), [selectedYear]);
  const { data: closedData, loading: closedLoading, error: closedError } = useSalesforceQuery(closedQueryFn);

  const loading = openLoading || closedLoading;
  const error = openError || closedError;

  const filteredOpen = useRepFilter(openData);
  const filteredClosed = useRepFilter(closedData);
  const [showAllDeals, setShowAllDeals] = useState(false);
  const [activeDeal, setActiveDeal] = useState(null);

  const { stageData, otherDeals } = useMemo(() => {
    const map = {};
    for (const stage of SALES_STAGES) {
      map[stage.name] = { deals: [], totalArr: 0 };
    }
    const other = [];

    // Open deals → all stages except Closed Won
    for (const opp of (filteredOpen || [])) {
      if (map[opp.StageName] !== undefined && opp.StageName !== 'Closed Won') {
        map[opp.StageName].deals.push(opp);
        map[opp.StageName].totalArr += opp.Annual_Recurring_Revenue_ARR__c ?? opp.Amount ?? 0;
      } else if (map[opp.StageName] === undefined) {
        other.push(opp);
      }
    }

    const PLATFORM_TYPES = ['New Account', 'Upsell', 'Cross-Sell'];
    // Closed Won → platform types only, matching the Closed Won tab exactly
    for (const opp of (filteredClosed || []).filter(o => o.IsWon && PLATFORM_TYPES.includes(o.Type))) {
      map['Closed Won'].deals.push(opp);
      map['Closed Won'].totalArr += opp.Annual_Recurring_Revenue_ARR__c ?? opp.Amount ?? 0;
    }

    return { stageData: map, otherDeals: other };
  }, [filteredOpen, filteredClosed]);

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
      <FunnelSummary stageData={stageData} onShowAll={() => setShowAllDeals(true)} />
      <PipelineByMonthMini deals={filteredOpen} />
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-xs text-rs-muted">Closed Won shown for selected year</span>
        <div className="flex items-center gap-1 border border-rs-border rounded-lg px-2 py-1 bg-white">
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
      <div className="space-y-4">
        {SALES_STAGES.map((stage) => (
          <StageCard
            key={stage.id}
            stage={stage}
            deals={stageData[stage.name]?.deals || []}
            onDealClick={setActiveDeal}
          />
        ))}
        {otherDeals.length > 0 && (
          <StageCard
            key="other"
            stage={{ id: 'other', order: '—', name: 'Other Stages', dayLimit: null, definition: 'Deals in stages outside the core 7-stage pipeline (e.g. Renewal Pending, Qualifying, Engaged).', exitCriteria: 'N/A' }}
            deals={otherDeals}
            onDealClick={setActiveDeal}
          />
        )}
      </div>

      <PipelineListPanel
        deals={showAllDeals ? filteredOpen : null}
        onClose={() => setShowAllDeals(false)}
        onDealClick={(deal) => { setShowAllDeals(false); setActiveDeal(deal); }}
      />
      <DealDetailPanel
        deal={activeDeal}
        onClose={() => setActiveDeal(null)}
      />
    </div>
  );
}
