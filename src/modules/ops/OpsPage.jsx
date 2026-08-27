import { useState, useMemo } from 'react';
import { fetchAstronomerData } from '../../datasources/astronomer';
import { fetchAllAccounts } from '../../datasources/salesforce';
import { useSalesforceQuery } from '../../hooks/useSalesforceQuery';
import { buildClientRows, mergeDailySeries } from '../../lib/opsMetrics';
import KpiCard from '../../components/common/KpiCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorState from '../../components/common/ErrorState';
import OpsClientTable from './OpsClientTable';
import OpsTrendChart from './OpsTrendChart';
import OpsClientDetail from './OpsClientDetail';
import { useDashboard } from '../../context/DashboardContext';

function avg(arr) {
  const valid = arr.filter((v) => v != null);
  return valid.length ? Math.round(valid.reduce((s, v) => s + v, 0) / valid.length) : null;
}

export default function OpsPage({ productTag, title = 'Batch Ops' }) {
  const { triggerRefresh } = useDashboard();
  const astronomerQ = useSalesforceQuery(fetchAstronomerData);
  const accountsQ   = useSalesforceQuery(fetchAllAccounts);
  const [selectedClient, setSelectedClient] = useState(null);
  const effectiveTag = productTag ?? 'all';

  const accountsById = useMemo(() =>
    new Map((accountsQ.data ?? []).map((a) => [a.Id, a])),
    [accountsQ.data]
  );

  const clientRows = useMemo(() => buildClientRows({
    dags:        astronomerQ.data?.dags ?? [],
    runsByDagId: astronomerQ.data?.runsByDagId ?? {},
    productTag:  effectiveTag,
    accountsById,
  }), [astronomerQ.data, accountsById, effectiveTag]);

  const aggregateSeries = useMemo(() => mergeDailySeries(clientRows), [clientRows]);

  const kpis = useMemo(() => {
    const todayFailed = clientRows.reduce((s, r) => s + (r.todayFailed || 0), 0);
    const todayTotal  = clientRows.reduce((s, r) => s + (r.todaySuccess || 0) + (r.todayFailed || 0), 0);
    const todayHealth = todayTotal > 0 ? Math.round(((todayTotal - todayFailed) / todayTotal) * 100) : null;
    return {
      clients:     clientRows.length,
      dags:        clientRows.reduce((s, r) => s + r.dagCount, 0),
      todayFailed,
      avgHealth7d: avg(clientRows.map((r) => r.healthPct7d)),
      todayHealth,
    };
  }, [clientRows]);

  const loading = astronomerQ.loading || accountsQ.loading;
  const error   = astronomerQ.error || accountsQ.error;

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
      <div className="mb-5">
        <h2 className="text-lg font-bold text-rs-text">{title}</h2>
        <p className="text-xs text-rs-muted mt-0.5">Live Astronomer DAG run health by client</p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <KpiCard title="Clients" value={kpis.clients} />
        <KpiCard title="Active DAGs" value={kpis.dags} />
        <KpiCard
          title="Failed Runs Today"
          value={kpis.todayFailed}
          subtitle={kpis.todayHealth != null ? `${kpis.todayHealth}% success today` : undefined}
        />
        <KpiCard
          title="Avg 7-day Health"
          value={kpis.avgHealth7d != null ? `${kpis.avgHealth7d}%` : '—'}
        />
      </div>

      {aggregateSeries.length > 0 && (
        <OpsTrendChart series={aggregateSeries} />
      )}

      <OpsClientTable rows={clientRows} onRowClick={setSelectedClient} />

      <OpsClientDetail row={selectedClient} onClose={() => setSelectedClient(null)} />
    </div>
  );
}
