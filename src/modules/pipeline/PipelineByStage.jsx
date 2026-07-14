import { useMemo, useState } from 'react';
import { format, getMonth, getYear } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useSalesforceQuery } from '../../hooks/useSalesforceQuery';
import { useRepFilter } from '../../hooks/useRepFilter';
import { fetchOpenOpportunities } from '../../datasources/salesforce';
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

function PipelineByMonthMini({ deals, scope, currentYear }) {
  const now = new Date();
  const todayMonth = getMonth(now);
  const todayYear = getYear(now);

  const { months, labelFmt, subtitle } = useMemo(() => {
    if (scope === 'all') {
      const monthSet = new Set();
      (deals || []).forEach((d) => {
        if (!d.CloseDate) return;
        const cd = new Date(d.CloseDate + 'T00:00:00');
        monthSet.add(`${getYear(cd)}-${String(getMonth(cd)).padStart(2, '0')}`);
      });
      const sorted = [...monthSet].sort()
        .map((key) => {
          const [y, m] = key.split('-').map(Number);
          return new Date(y, m, 1);
        })
        .filter((d) => getYear(d) > todayYear || (getYear(d) === todayYear && getMonth(d) >= todayMonth));
      return { months: sorted, labelFmt: 'MMM yy', subtitle: 'All open deals by close month' };
    }
    const targetYear = scope === 'current' ? currentYear : currentYear + 1;
    const ms = Array.from({ length: 12 }, (_, i) => new Date(targetYear, i, 1))
      .filter((d) => getYear(d) > todayYear || (getYear(d) === todayYear && getMonth(d) >= todayMonth));
    return { months: ms, labelFmt: 'MMM', subtitle: `Open deals closing in ${targetYear}` };
  }, [deals, scope, currentYear]);

  const data = months.map((monthDate) => {
    const m = getMonth(monthDate);
    const y = getYear(monthDate);
    const monthDeals = (deals || []).filter((d) => {
      if (!d.CloseDate) return false;
      const cd = new Date(d.CloseDate + 'T00:00:00');
      return getMonth(cd) === m && getYear(cd) === y;
    });
    const arr = monthDeals.reduce((s, d) => s + (d.Annual_Recurring_Revenue_ARR__c ?? d.Amount ?? 0), 0);
    return { label: format(monthDate, labelFmt), arr, count: monthDeals.length, month: m, year: y };
  });

  const maxArr = Math.max(...data.map((d) => d.arr), 1);

  return (
    <div className="rounded-card border border-rs-border bg-white p-4 mb-4">
      <h3 className="text-sm font-semibold text-rs-text mb-1">Pipeline Close Schedule</h3>
      <p className="text-[11px] text-rs-muted mb-3">{subtitle}</p>
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
                fill={entry.month === todayMonth && entry.year === todayYear ? '#0C8EA3' : '#0C8EA380'}
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
  const [selectedScope, setSelectedScope] = useState('all');

  const { data: openData, loading, error } = useSalesforceQuery(fetchOpenOpportunities);

  const filteredOpen = useRepFilter(openData);
  const [showAllDeals, setShowAllDeals] = useState(false);
  const [activeDeal, setActiveDeal] = useState(null);

  const scopedOpen = useMemo(() => {
    if (selectedScope === 'all') return filteredOpen || [];
    const targetYear = selectedScope === 'current' ? currentYear : currentYear + 1;
    return (filteredOpen || []).filter((d) => {
      if (!d.CloseDate) return false;
      return new Date(d.CloseDate + 'T00:00:00').getFullYear() === targetYear;
    });
  }, [filteredOpen, selectedScope, currentYear]);

  const stageData = useMemo(() => {
    const map = {};
    for (const stage of SALES_STAGES) {
      map[stage.name] = { deals: [], totalArr: 0 };
    }

    for (const opp of scopedOpen) {
      if (map[opp.StageName] !== undefined && opp.StageName !== 'Closed Won') {
        map[opp.StageName].deals.push(opp);
        map[opp.StageName].totalArr += opp.Annual_Recurring_Revenue_ARR__c ?? opp.Amount ?? 0;
      }
    }

    return map;
  }, [scopedOpen]);

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

  const scopeOptions = [
    { value: 'all',     label: 'All' },
    { value: 'current', label: String(currentYear) },
    { value: 'next',    label: String(currentYear + 1) },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4 px-1">
        <span className="text-xs font-medium text-rs-text">Close Date</span>
        <div className="flex gap-1">
          {scopeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSelectedScope(opt.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors
                ${selectedScope === opt.value
                  ? 'bg-rs-teal/10 text-rs-teal border-rs-teal/30'
                  : 'text-rs-muted border-rs-border hover:text-rs-text hover:border-rs-text/30'
                }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <FunnelSummary stageData={stageData} onShowAll={() => setShowAllDeals(true)} />
      <PipelineByMonthMini deals={scopedOpen} scope={selectedScope} currentYear={currentYear} />
      <div className="space-y-4">
        {SALES_STAGES.map((stage) => (
          <StageCard
            key={stage.id}
            stage={stage}
            deals={stageData[stage.name]?.deals || []}
            onDealClick={setActiveDeal}
          />
        ))}
      </div>

      <PipelineListPanel
        deals={showAllDeals ? scopedOpen : null}
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
