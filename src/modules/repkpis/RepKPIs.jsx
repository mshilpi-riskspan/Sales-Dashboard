import { useMemo } from 'react';
import { useSalesforceQuery } from '../../hooks/useSalesforceQuery';
import { fetchTasksThisQuarter, fetchEventsThisQuarter, fetchOppsThisQuarter, fetchOppsYTD } from '../../datasources/salesforce';
import { useRepFilter } from '../../hooks/useRepFilter';
import { useDashboard } from '../../context/DashboardContext';
import { computeMetrics, computePerRepMetrics } from './metrics';
import ActivitySection from './ActivitySection';
import PipelineGrowthSection from './PipelineGrowthSection';
import DealProgressionSection from './DealProgressionSection';
import RevenueSection from './RevenueSection';
import RepBreakdownTable from './RepBreakdownTable';
import ErrorState from '../../components/common/ErrorState';
import LoadingSpinner from '../../components/common/LoadingSpinner';

function useAllQueries() {
  const tasks = useSalesforceQuery(fetchTasksThisQuarter);
  const events = useSalesforceQuery(fetchEventsThisQuarter);
  const oppsQtr = useSalesforceQuery(fetchOppsThisQuarter);
  const oppsYtd = useSalesforceQuery(fetchOppsYTD);
  return { tasks, events, oppsQtr, oppsYtd };
}

export default function RepKPIs() {
  const { selectedRep, triggerRefresh } = useDashboard();
  const { tasks, events, oppsQtr, oppsYtd } = useAllQueries();

  const loading = tasks.loading || events.loading || oppsQtr.loading || oppsYtd.loading;
  const error = tasks.error || events.error || oppsQtr.error || oppsYtd.error;

  const repId = selectedRep === 'all' ? null : selectedRep;

  const metrics = useMemo(() => {
    if (!tasks.data || !events.data || !oppsQtr.data || !oppsYtd.data) return null;
    return computeMetrics(tasks.data, events.data, oppsQtr.data, oppsYtd.data, repId);
  }, [tasks.data, events.data, oppsQtr.data, oppsYtd.data, repId]);

  const repMetrics = useMemo(() => {
    if (selectedRep !== 'all') return null;
    if (!tasks.data || !events.data || !oppsQtr.data || !oppsYtd.data) return null;
    return computePerRepMetrics(tasks.data, events.data, oppsQtr.data, oppsYtd.data);
  }, [selectedRep, tasks.data, events.data, oppsQtr.data, oppsYtd.data]);

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
      <ActivitySection metrics={metrics} loading={loading} />
      <PipelineGrowthSection metrics={metrics} loading={loading} />
      <DealProgressionSection metrics={metrics} loading={loading} />
      <RevenueSection metrics={metrics} loading={loading} />
      {selectedRep === 'all' && repMetrics && <RepBreakdownTable repMetrics={repMetrics} />}
    </div>
  );
}
