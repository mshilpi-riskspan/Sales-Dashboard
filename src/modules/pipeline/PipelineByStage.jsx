import { useMemo, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
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

export default function PipelineByStage() {
  const { triggerRefresh } = useDashboard();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const queryFn = useMemo(() => () => fetchOpenOpportunities(selectedYear), [selectedYear]);
  const { data, loading, error } = useSalesforceQuery(queryFn);
  const filtered = useRepFilter(data);
  const [showAllDeals, setShowAllDeals] = useState(false);
  const [activeDeal, setActiveDeal] = useState(null);

  const { stageData, otherDeals } = useMemo(() => {
    const map = {};
    for (const stage of SALES_STAGES) {
      map[stage.name] = { deals: [], totalArr: 0 };
    }
    const other = [];
    if (!filtered) return { stageData: map, otherDeals: other };
    for (const opp of filtered) {
      if (map[opp.StageName] !== undefined) {
        map[opp.StageName].deals.push(opp);
        map[opp.StageName].totalArr += opp.Annual_Recurring_Revenue_ARR__c ?? opp.Amount ?? 0;
      } else {
        other.push(opp);
      }
    }
    return { stageData: map, otherDeals: other };
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
        deals={showAllDeals ? filtered : null}
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
