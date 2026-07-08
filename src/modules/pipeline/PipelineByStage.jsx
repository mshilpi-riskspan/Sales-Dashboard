import { useMemo, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
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
