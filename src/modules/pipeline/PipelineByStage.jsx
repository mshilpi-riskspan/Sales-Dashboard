import { useMemo, useState } from 'react';
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
  const { data, loading, error } = useSalesforceQuery(fetchOpenOpportunities);
  const filtered = useRepFilter(data);
  const [showAllDeals, setShowAllDeals] = useState(false);
  const [activeDeal, setActiveDeal] = useState(null);

  const stageData = useMemo(() => {
    const map = {};
    for (const stage of SALES_STAGES) {
      map[stage.name] = { deals: [], totalArr: 0 };
    }
    if (!filtered) return map;
    for (const opp of filtered) {
      if (map[opp.StageName]) {
        map[opp.StageName].deals.push(opp);
        map[opp.StageName].totalArr += opp.Annual_Recurring_Revenue_ARR__c ?? opp.Amount ?? 0;
      }
    }
    return map;
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
