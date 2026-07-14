import { useMemo, useState, useCallback } from 'react';
import { useSalesforceQuery } from '../../hooks/useSalesforceQuery';
import { fetchTasksThisQuarter, fetchEventsThisQuarter, fetchOppsThisQuarter, fetchOppsYTD, fetchOpenOpportunities, fetchClosedOppsInYear } from '../../datasources/salesforce';
import { useRepFilter } from '../../hooks/useRepFilter';
import { useDashboard } from '../../context/DashboardContext';
import { computeMetrics, computePerRepMetrics } from './metrics';
import ActivitySection from './ActivitySection';
import PipelineGrowthSection from './PipelineGrowthSection';
import DealProgressionSection from './DealProgressionSection';
import RevenueSection from './RevenueSection';
import PerformanceCharts from './PerformanceCharts';
import RepBreakdownTable from './RepBreakdownTable';
import KpiDrillPanel from './KpiDrillPanel';
import DealDetailPanel from '../../components/common/DealDetailPanel';
import ErrorState from '../../components/common/ErrorState';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const lastYear = new Date().getFullYear() - 1;
const lastYearQueryFn = () => fetchClosedOppsInYear(lastYear);

function useAllQueries() {
  const tasks = useSalesforceQuery(fetchTasksThisQuarter);
  const events = useSalesforceQuery(fetchEventsThisQuarter);
  const oppsQtr = useSalesforceQuery(fetchOppsThisQuarter);
  const oppsYtd = useSalesforceQuery(fetchOppsYTD);
  const openOpps = useSalesforceQuery(fetchOpenOpportunities);
  const lastYearOpps = useSalesforceQuery(lastYearQueryFn);
  return { tasks, events, oppsQtr, oppsYtd, openOpps, lastYearOpps };
}

export default function RepKPIs() {
  const { selectedRep, repList, triggerRefresh } = useDashboard();
  const { tasks, events, oppsQtr, oppsYtd, openOpps, lastYearOpps } = useAllQueries();
  const [drillState, setDrillState] = useState(null); // { title, records, type }
  const [activeDeal, setActiveDeal] = useState(null);

  const loading = tasks.loading || events.loading || oppsQtr.loading || oppsYtd.loading || openOpps.loading;
  const error = tasks.error || events.error || oppsQtr.error || oppsYtd.error || openOpps.error;

  const repId = selectedRep === 'all' ? null : selectedRep;

  const metrics = useMemo(() => {
    if (!tasks.data || !events.data || !oppsQtr.data || !oppsYtd.data || !openOpps.data) return null;
    return computeMetrics(tasks.data, events.data, oppsQtr.data, oppsYtd.data, openOpps.data, repId);
  }, [tasks.data, events.data, oppsQtr.data, oppsYtd.data, openOpps.data, repId]);

  const repMetrics = useMemo(() => {
    if (selectedRep !== 'all') return null;
    if (!tasks.data || !events.data || !oppsQtr.data || !oppsYtd.data || !openOpps.data) return null;
    const activeRepIds = new Set(repList.map((r) => r.id));
    return computePerRepMetrics(tasks.data, events.data, oppsQtr.data, oppsYtd.data, openOpps.data)
      .filter((r) => activeRepIds.has(r.id));
  }, [selectedRep, tasks.data, events.data, oppsQtr.data, oppsYtd.data, openOpps.data, repList]);

  const handleDrill = useCallback((title, records, type) => {
    if (records?.length) setDrillState({ title, records, type });
  }, []);

  const handleDealClick = useCallback((deal) => {
    setDrillState(null);
    setActiveDeal(deal);
  }, []);

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
    <div className="space-y-8">
      <PerformanceCharts
        oppsYtd={oppsYtd.data}
        lastYearOpps={lastYearOpps.data}
        openOpps={openOpps.data}
        repId={repId}
      />
      <ActivitySection metrics={metrics} loading={loading} onDrill={handleDrill} />
      <PipelineGrowthSection metrics={metrics} loading={loading} onDrill={handleDrill} />
      <DealProgressionSection metrics={metrics} loading={loading} onDrill={handleDrill} />
      <RevenueSection metrics={metrics} loading={loading} onDrill={handleDrill} />
      {selectedRep === 'all' && repMetrics && <RepBreakdownTable repMetrics={repMetrics} />}

      <KpiDrillPanel
        title={drillState?.title}
        records={drillState?.records}
        type={drillState?.type}
        onClose={() => setDrillState(null)}
        onDealClick={handleDealClick}
      />
      <DealDetailPanel
        deal={activeDeal}
        onClose={() => setActiveDeal(null)}
        tasks={tasks.data}
        events={events.data}
      />
    </div>
  );
}
