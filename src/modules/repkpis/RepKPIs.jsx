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
import RepSalesGoal from './RepSalesGoal';
import RepGoalComparison from './RepGoalComparison';
import KpiDrillPanel from './KpiDrillPanel';
import DealDetailPanel from '../../components/common/DealDetailPanel';
import ErrorState from '../../components/common/ErrorState';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { getRepGoal, TRACKED_REP_NAMES } from '../../config/repGoals';

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

  // This page is scoped to the 4 tracked reps in src/config/repGoals.js — keep the
  // breakdown table and goal-comparison chart in sync with the Topbar dropdown.
  const trackedRepList = useMemo(
    () => repList.filter((r) => TRACKED_REP_NAMES.some((f) => r.name.toLowerCase().includes(f.toLowerCase()))),
    [repList]
  );

  const repName = trackedRepList.find((r) => r.id === selectedRep)?.name;
  const repGoal = selectedRep !== 'all' ? getRepGoal(repName) : null;

  // The underlying SF queries return org-wide records with no rep restriction — when
  // "All" is selected, scope down to just the 4 tracked reps first so the divide-by-4
  // team average in computeMetrics operates on the right pool, not the whole org.
  const trackedRepIds = useMemo(() => new Set(trackedRepList.map((r) => r.id)), [trackedRepList]);
  const scopedData = useMemo(() => {
    if (selectedRep !== 'all') {
      return { tasks: tasks.data, events: events.data, oppsQtr: oppsQtr.data, oppsYtd: oppsYtd.data, openOpps: openOpps.data, lastYearOpps: lastYearOpps.data };
    }
    const scope = (arr) => (arr || []).filter((r) => trackedRepIds.has(r.OwnerId));
    return {
      tasks: scope(tasks.data), events: scope(events.data), oppsQtr: scope(oppsQtr.data),
      oppsYtd: scope(oppsYtd.data), openOpps: scope(openOpps.data), lastYearOpps: scope(lastYearOpps.data),
    };
  }, [selectedRep, trackedRepIds, tasks.data, events.data, oppsQtr.data, oppsYtd.data, openOpps.data, lastYearOpps.data]);

  const metrics = useMemo(() => {
    if (!scopedData.tasks || !scopedData.events || !scopedData.oppsQtr || !scopedData.oppsYtd || !scopedData.openOpps) return null;
    return computeMetrics(scopedData.tasks, scopedData.events, scopedData.oppsQtr, scopedData.oppsYtd, scopedData.openOpps, repId);
  }, [scopedData, repId]);

  const repMetrics = useMemo(() => {
    if (selectedRep !== 'all') return null;
    if (!tasks.data || !events.data || !oppsQtr.data || !oppsYtd.data || !openOpps.data) return null;
    const activeRepIds = new Set(trackedRepList.map((r) => r.id));
    return computePerRepMetrics(tasks.data, events.data, oppsQtr.data, oppsYtd.data, openOpps.data)
      .filter((r) => activeRepIds.has(r.id));
  }, [selectedRep, tasks.data, events.data, oppsQtr.data, oppsYtd.data, openOpps.data, trackedRepList]);

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
        oppsYtd={scopedData.oppsYtd}
        lastYearOpps={scopedData.lastYearOpps}
        openOpps={scopedData.openOpps}
        repId={repId}
      />
      <ActivitySection metrics={metrics} loading={loading} onDrill={handleDrill} />
      <PipelineGrowthSection metrics={metrics} loading={loading} onDrill={handleDrill} />
      <DealProgressionSection metrics={metrics} loading={loading} onDrill={handleDrill} />
      <RevenueSection metrics={metrics} loading={loading} onDrill={handleDrill} />
      {selectedRep !== 'all' && repGoal != null && (
        <RepSalesGoal repId={repId} repName={repName} oppsYtd={oppsYtd.data} goal={repGoal} />
      )}
      {selectedRep === 'all' && (
        <RepGoalComparison oppsYtd={oppsYtd.data} repList={trackedRepList} />
      )}
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
