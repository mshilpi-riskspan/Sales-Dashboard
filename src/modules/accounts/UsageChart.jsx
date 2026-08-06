import { useState, useEffect, useMemo, useRef } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { fetchAccountUsageChartData } from '../../datasources/snowflake';

// Registry of every chartable metric — 'agg' controls how bucketed periods
// combine multiple days: 'sum' for counts, 'avg' for figures that are
// already a per-day aggregate (latency, distinct users) where summing across
// days would be meaningless/double-counted.
export const METRICS = [
  { key: 'API_CALL_VOLUME', label: 'Queries', agg: 'sum' },
  { key: 'FORECAST_RUN_COUNT', label: 'Forecast Runs', agg: 'sum' },
  { key: 'MODEL_EXECUTIONS', label: 'Model Executions', agg: 'sum' },
  { key: 'MODEL_FAILURES', label: 'Model Failures', agg: 'sum' },
  { key: 'SCENARIO_RUNS', label: 'Scenario Runs', agg: 'sum' },
  { key: 'STRESS_TEST_RUNS', label: 'Stress Tests', agg: 'sum' },
  { key: 'PREMIUM_FEATURE_USAGE_COUNT', label: 'API Calls', agg: 'sum' },
  { key: 'OVERRIDE_COUNT', label: 'Overrides', agg: 'sum' },
  { key: 'FORECAST_LOAN_COUNT', label: 'Forecast Loans', agg: 'sum' },
  { key: 'FORECAST_SECURITY_COUNT', label: 'Forecast Securities', agg: 'sum' },
  { key: 'AVG_API_LATENCY_MS', label: 'Avg API Latency (ms)', agg: 'avg' },
  { key: 'DISTINCT_USERS', label: 'Distinct Users', agg: 'avg' },
];

export const LOOKBACKS = [
  { key: '30d', label: '30d', days: 30 },
  { key: '3mo', label: '3mo', days: 90 },
  { key: '6mo', label: '6mo', days: 180 },
  { key: '1yr', label: '1yr', days: 365 },
  { key: '2yr', label: '2yr', days: 730 },
  { key: '3yr', label: '3yr', days: 1095 },
];

const FREQUENCIES = [
  { key: 'day', label: 'Daily' },
  { key: 'week', label: 'Weekly' },
  { key: 'month', label: 'Monthly' },
  { key: 'quarter', label: 'Quarterly' },
  { key: 'year', label: 'Yearly' },
];

function mergeDaily(usageDaily, distinctUsersDaily) {
  const map = new Map();
  for (const row of usageDaily) map.set(row.METRIC_DATE, { ...row });
  for (const row of distinctUsersDaily) {
    const existing = map.get(row.METRIC_DATE) || { METRIC_DATE: row.METRIC_DATE };
    existing.DISTINCT_USERS = row.DISTINCT_USERS;
    map.set(row.METRIC_DATE, existing);
  }
  return [...map.values()].sort((a, b) => a.METRIC_DATE.localeCompare(b.METRIC_DATE));
}

// Adapted from client-health's aggregateByGranularity — client-side bucketing
// so switching frequency never refetches (only the lookback window does).
function bucketKey(dateStr, freq) {
  if (freq === 'day') return dateStr;
  if (freq === 'month') return dateStr.slice(0, 7);
  if (freq === 'quarter') {
    const m = Number(dateStr.slice(5, 7));
    return `${dateStr.slice(0, 4)}-Q${Math.ceil(m / 3)}`;
  }
  if (freq === 'year') return dateStr.slice(0, 4);
  // week — Monday-of-week key
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function bucketData(rows, metric, freq) {
  const buckets = new Map();
  for (const row of rows) {
    const val = row[metric.key];
    if (val === null || val === undefined) continue;
    const key = bucketKey(row.METRIC_DATE, freq);
    if (!buckets.has(key)) buckets.set(key, { sum: 0, count: 0 });
    const b = buckets.get(key);
    b.sum += val;
    b.count += 1;
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, { sum, count }]) => ({ label, value: metric.agg === 'avg' ? Math.round((sum / count) * 100) / 100 : sum }));
}

function MetricDropdown({ metric, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-rs-teal/30 bg-rs-teal/10 text-rs-teal font-medium"
      >
        {metric.label}
        <ChevronDownIcon className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 left-0 bg-white border border-rs-border rounded-lg shadow-lg py-1 max-h-64 overflow-y-auto min-w-[190px]">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => { onChange(m.key); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-rs-surface transition-colors ${m.key === metric.key ? 'text-rs-teal font-medium' : 'text-rs-text'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PillGroup({ options, value, onChange }) {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
            value === o.key ? 'bg-rs-teal text-white border-rs-teal' : 'text-rs-muted border-rs-border hover:border-rs-teal/50'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function UsageChart({ accountId, clientId, onWindowChange }) {
  const [metricKey, setMetricKey] = useState('API_CALL_VOLUME');
  const [lookback, setLookback] = useState('6mo');
  const [frequency, setFrequency] = useState('week');
  const [dailyRows, setDailyRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const daysBack = LOOKBACKS.find((l) => l.key === lookback)?.days || 180;
  const lookbackLabel = LOOKBACKS.find((l) => l.key === lookback)?.label || lookback;

  // Only the lookback window triggers a refetch — metric/frequency changes
  // just re-derive from the same already-fetched daily rows.
  useEffect(() => {
    setLoading(true);
    fetchAccountUsageChartData({ accountId, clientId, daysBack })
      .then((data) => setDailyRows(mergeDaily(data.usageDaily || [], data.distinctUsersDaily || [])))
      .catch(() => setDailyRows([]))
      .finally(() => setLoading(false));
  }, [accountId, clientId, daysBack]);

  // Bubble the fetched window up so a parent panel can derive its own
  // lookback-driven stats from the exact same daily rows, instead of a
  // separate always-fixed-30-day fetch.
  useEffect(() => {
    onWindowChange?.({ dailyRows, daysBack, lookbackLabel, loading });
  }, [dailyRows, daysBack, lookbackLabel, loading, onWindowChange]);

  const metric = METRICS.find((m) => m.key === metricKey) || METRICS[0];
  const chartData = useMemo(() => bucketData(dailyRows, metric, frequency), [dailyRows, metric, frequency]);

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <MetricDropdown metric={metric} onChange={setMetricKey} />
        <PillGroup options={LOOKBACKS} value={lookback} onChange={setLookback} />
        <PillGroup options={FREQUENCIES} value={frequency} onChange={setFrequency} />
      </div>

      {loading ? (
        <div className="h-48 flex items-center justify-center text-xs text-rs-muted">Loading…</div>
      ) : chartData.length === 0 ? (
        <div className="h-48 flex items-center justify-center text-xs text-rs-muted">No data for this range.</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#858C9C' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#858C9C' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #DADEE5' }} formatter={(v) => [v, metric.label]} />
            <Line type="monotone" dataKey="value" stroke="#0C8EA3" strokeWidth={2} dot={false} name={metric.label} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
