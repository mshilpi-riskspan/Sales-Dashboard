import SlidePanel from '../../components/common/SlidePanel';
import StatTile from './StatTile';
import UsageChart from './UsageChart';

function formatNum(v) {
  if (v === null || v === undefined) return '—';
  return Math.round(v).toLocaleString();
}

function pctDelta(current, prev) {
  if (current === null || prev === null || prev === undefined) return null;
  if (prev === 0) return current > 0 ? '+100%' : null;
  const pct = Math.round(((current - prev) / prev) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

// Full Usage stat grid + the flexible UsageChart (any metric/lookback/
// frequency), behind the "Usage" tile's click.
export default function UsageCategoryPanel({ open, onClose, usage, accountId, clientId }) {
  const failures = usage?.failures || [];
  const usageMetrics = usage?.usage;
  const distinctUsers = usage?.distinctUsers;
  const servers = usage?.usageByServer || [];

  return (
    <SlidePanel open={open} onClose={onClose} title="Usage" width="min(70vw, 1100px)">
      <div className="p-4 space-y-3">
        <div>
          <UsageChart accountId={accountId} clientId={clientId} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <StatTile
            label="API Calls (30d)"
            value={formatNum(usageMetrics?.API_CALLS_30D)}
            delta={pctDelta(usageMetrics?.API_CALLS_30D, usageMetrics?.API_CALLS_PREV_30D)}
            unavailable={failures.includes('usage')}
          />
          <StatTile
            label="Forecast Runs (30d)"
            value={formatNum(usageMetrics?.FORECASTS_30D)}
            delta={pctDelta(usageMetrics?.FORECASTS_30D, usageMetrics?.FORECASTS_PREV_30D)}
            unavailable={failures.includes('usage')}
          />
          <StatTile label="Model Executions (30d)" value={formatNum(usageMetrics?.MODEL_EXECUTIONS_30D)} unavailable={failures.includes('usage')} />
          <StatTile label="Model Failures (30d)" value={formatNum(usageMetrics?.MODEL_FAILURES_30D)} unavailable={failures.includes('usage')} />
          <StatTile label="Scenario Runs (30d)" value={formatNum(usageMetrics?.SCENARIO_RUNS_30D)} unavailable={failures.includes('usage')} />
          <StatTile label="Stress Tests (30d)" value={formatNum(usageMetrics?.STRESS_TESTS_30D)} unavailable={failures.includes('usage')} />
          <StatTile label="Premium Feature Usage (30d)" value={formatNum(usageMetrics?.PREMIUM_FEATURE_USAGE_30D)} unavailable={failures.includes('usage')} />
          <StatTile label="Overrides (30d)" value={formatNum(usageMetrics?.OVERRIDES_30D)} unavailable={failures.includes('usage')} />
          <StatTile label="Forecast Loans (30d)" value={formatNum(usageMetrics?.FORECAST_LOANS_30D)} unavailable={failures.includes('usage')} />
          <StatTile label="Forecast Securities (30d)" value={formatNum(usageMetrics?.FORECAST_SECURITIES_30D)} unavailable={failures.includes('usage')} />
          <StatTile
            label="Avg API Latency (30d)"
            value={usageMetrics?.AVG_LATENCY_MS_30D != null ? `${Math.round(usageMetrics.AVG_LATENCY_MS_30D)}ms` : '—'}
            unavailable={failures.includes('usage')}
          />
          <StatTile label="Distinct Users (30d)" value={formatNum(distinctUsers?.DISTINCT_USERS)} unavailable={failures.includes('distinctUsers')} />
        </div>

        {(distinctUsers?.USER_RUNS || distinctUsers?.SYSTEM_RUNS) ? (
          <p className="text-[11px] text-rs-muted">
            {formatNum(distinctUsers.USER_DISTINCT_USERS)} end user{distinctUsers.USER_DISTINCT_USERS === 1 ? '' : 's'} ({formatNum(distinctUsers.USER_RUNS)} runs) ·{' '}
            {formatNum(distinctUsers.SYSTEM_DISTINCT_USERS)} system/admin/batch account{distinctUsers.SYSTEM_DISTINCT_USERS === 1 ? '' : 's'} ({formatNum(distinctUsers.SYSTEM_RUNS)} runs)
          </p>
        ) : null}

        {servers.length > 0 && (
          <div>
            <p className="text-[10px] text-rs-muted mb-1">Forecast runs by server (30 days)</p>
            <div className="flex flex-wrap gap-2">
              {servers.map((s) => (
                <span key={s.SERVER_NAME} className="text-[11px] bg-rs-surface border border-rs-border/50 rounded-full px-2 py-0.5">
                  {s.SERVER_NAME}: <span className="font-semibold text-rs-text">{formatNum(s.RUN_COUNT)}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </SlidePanel>
  );
}
