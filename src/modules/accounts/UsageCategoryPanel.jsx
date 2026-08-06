import { useState, useEffect, useMemo, Fragment } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import SlidePanel from '../../components/common/SlidePanel';
import StatTile from './StatTile';
import UsageChart, { METRICS } from './UsageChart';
import { fetchAccountUsers, fetchUserActivity } from '../../datasources/snowflake';

function formatNum(v) {
  if (v === null || v === undefined) return '—';
  return Math.round(v).toLocaleString();
}

// Sums (or averages, per metric.agg) a chartable metric across whatever
// daily rows are currently loaded — i.e. exactly the window UsageChart's own
// lookback pill has fetched, so the grid below always matches what the
// chart above is showing rather than a separate always-fixed-30-day figure.
function aggregateMetric(rows, metric) {
  let sum = 0, count = 0;
  for (const row of rows) {
    const v = row[metric.key];
    if (v === null || v === undefined) continue;
    sum += v;
    count += 1;
  }
  if (count === 0) return null;
  return metric.agg === 'avg' ? Math.round((sum / count) * 100) / 100 : sum;
}

function formatMetricValue(metric, value) {
  if (value == null) return '—';
  if (metric.key === 'AVG_API_LATENCY_MS') return `${Math.round(value)}ms`;
  return formatNum(value);
}

function relativeDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00' : dateStr);
  const diff = Math.floor((Date.now() - d) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 30) return `${diff}d ago`;
  return dateStr.slice(0, 10);
}

// RS_ANALYTICS_TYPE / RS_SECURITY_TYPE values can carry composite keys like
// "CASHFLOW;EdgeScenario=Base" — split on ';' and drop the EdgeScenario
// annotation, same client-side flattening client-health's page.tsx does
// before rendering these as count pills.
function flattenTypeCounts(...objs) {
  const out = new Map();
  for (const obj of objs) {
    for (const [key, count] of Object.entries(obj || {})) {
      const label = key.split(';').find((part) => !/^EdgeScenario=/i.test(part)) || key;
      out.set(label, (out.get(label) || 0) + count);
    }
  }
  return [...out.entries()].sort((a, b) => b[1] - a[1]);
}

function TypePills({ counts }) {
  const flat = flattenTypeCounts(counts);
  if (flat.length === 0) return <span className="text-rs-muted">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {flat.map(([label, count]) => (
        <span key={label} className="text-[10px] bg-rs-surface border border-rs-border/50 rounded-full px-1.5 py-0.5 text-rs-muted whitespace-nowrap">
          {label} <span className="font-medium text-rs-text">{formatNum(count)}</span>
        </span>
      ))}
    </div>
  );
}

// Two-line daily chart — amber forecast runs, teal query runs — for either a
// single expanded user row or the aggregate across the current Users
// selection at the top of the panel.
function RunActivityChart({ activity, height = 160, showLegend = true }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={activity} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <XAxis dataKey="RUN_DATE" tick={{ fontSize: 10, fill: '#858C9C' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: '#858C9C' }} axisLine={false} tickLine={false} width={32} />
        <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #DADEE5' }} />
        {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />}
        <Line type="monotone" dataKey="FORECAST_RUN_COUNT" name="Forecast runs" stroke="#D97706" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="QUERY_RUN_COUNT" name="Query runs" stroke="#0C8EA3" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function ActivityRow({ userId, accountId, clientId, daysBack, colSpan }) {
  const [activity, setActivity] = useState(null);

  useEffect(() => {
    setActivity(null);
    fetchUserActivity({ accountId, clientId, userIds: [userId], daysBack })
      .then((data) => setActivity(data.activity || []))
      .catch(() => setActivity([]));
  }, [userId, accountId, clientId, daysBack]);

  return (
    <tr className="bg-rs-surface/40">
      <td colSpan={colSpan} className="px-3 py-3">
        {activity === null ? (
          <p className="text-xs text-rs-muted">Loading activity…</p>
        ) : activity.length === 0 ? (
          <p className="text-xs text-rs-muted">No run activity in this range.</p>
        ) : (
          <RunActivityChart activity={activity} height={120} showLegend={false} />
        )}
      </td>
    </tr>
  );
}

const RANGES = [
  { key: '7', label: '1W' },
  { key: '30', label: '1M' },
  { key: '90', label: '3M' },
  { key: '365', label: '1Y' },
];

const TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'System/Batch', label: 'System/Batch' },
  { key: 'End User', label: 'Users' },
];

// Full Usage stat grid + flexible UsageChart, blended with a per-user Users
// filter (ported from client-health-app's Client Detail > Users tab — same
// RS_ANALYTICS_STATS_MASTER/RS_QUERY_STATS_MASTER/RS_ANALYTICS_STATS_INFO
// source tables). Selecting one or more users swaps the client-wide
// FACT_USAGE_METRICS chart+grid for that selection's own run activity and
// aggregated stats — the only metrics actually attributable to a user in
// this warehouse are forecast/query runs and their loan/security breakdown,
// so the rest of the FACT_USAGE_METRICS grid has no per-user equivalent.
export default function UsageCategoryPanel({ open, onClose, usage, accountId, clientId }) {
  const distinctUsers = usage?.distinctUsers;
  const servers = usage?.usageByServer || [];

  const [chartWindow, setChartWindow] = useState({ dailyRows: [], daysBack: 180, lookbackLabel: '6mo', loading: true });
  const [usersDaysBack, setUsersDaysBack] = useState('30');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedUserIds, setSelectedUserIds] = useState(() => new Set());
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [chartActivity, setChartActivity] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUsersLoading(true);
    fetchAccountUsers({ accountId, clientId, daysBack: usersDaysBack })
      .then((data) => setUsers(data.users || []))
      .catch(() => setUsers([]))
      .finally(() => setUsersLoading(false));
  }, [open, accountId, clientId, usersDaysBack]);

  const selectedIdsList = useMemo(() => [...selectedUserIds], [selectedUserIds]);

  useEffect(() => {
    if (!open || selectedIdsList.length === 0) {
      setChartActivity([]);
      return;
    }
    setChartLoading(true);
    fetchUserActivity({ accountId, clientId, userIds: selectedIdsList, daysBack: usersDaysBack })
      .then((data) => setChartActivity(data.activity || []))
      .catch(() => setChartActivity([]))
      .finally(() => setChartLoading(false));
  }, [open, accountId, clientId, selectedIdsList, usersDaysBack]);

  function toggleUser(userId) {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  const tableUsers = useMemo(() => {
    if (selectedUserIds.size > 0) return users.filter((u) => selectedUserIds.has(u.RS_USER_ID));
    return typeFilter === 'all' ? users : users.filter((u) => u.USER_TYPE === typeFilter);
  }, [users, selectedUserIds, typeFilter]);

  const selectedAggregate = useMemo(() => {
    if (selectedUserIds.size === 0) return null;
    const rows = users.filter((u) => selectedUserIds.has(u.RS_USER_ID));
    return {
      runCount: rows.reduce((s, u) => s + (u.RUN_COUNT || 0), 0),
      queryCount: rows.reduce((s, u) => s + (u.QUERY_COUNT || 0), 0),
      forecastCount: rows.reduce((s, u) => s + (u.FORECAST_COUNT || 0), 0),
      activeDays: rows.reduce((s, u) => s + (u.ACTIVE_DAYS || 0), 0),
      loanCount: rows.reduce((s, u) => s + (u.LOAN_COUNT || 0), 0),
      securityCount: rows.reduce((s, u) => s + (u.SECURITY_COUNT || 0), 0),
      securityTypes: flattenTypeCounts(...rows.map((u) => u.SECURITY_TYPES)),
      analyticsTypes: flattenTypeCounts(...rows.map((u) => u.ANALYTICS_TYPES)),
    };
  }, [users, selectedUserIds]);

  return (
    <SlidePanel open={open} onClose={onClose} title="Usage" width="min(85vw, 1400px)">
      <div className="p-4 space-y-4">
        {/* Users filter — selecting narrows the chart/stats below to just
            these users; empty selection shows the full client-wide view. */}
        <div>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-rs-muted">Users</p>
            <div className="flex gap-1">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setUsersDaysBack(r.key)}
                  className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                    usersDaysBack === r.key ? 'bg-rs-teal text-white border-rs-teal' : 'text-rs-muted border-rs-border hover:border-rs-teal/50'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          {usersLoading ? (
            <div className="flex gap-1.5">
              {[1, 2, 3].map((i) => <div key={i} className="h-6 w-20 bg-rs-surface rounded-full animate-pulse" />)}
            </div>
          ) : users.length === 0 ? (
            <p className="text-xs text-rs-muted">No user-level activity in this range.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {users.map((u) => {
                const isSelected = selectedUserIds.has(u.RS_USER_ID);
                return (
                  <button
                    key={u.RS_USER_ID}
                    onClick={() => toggleUser(u.RS_USER_ID)}
                    className={`text-[11px] px-2 py-1 rounded-full border transition-colors flex items-center gap-1 ${
                      isSelected ? 'bg-rs-teal text-white border-rs-teal' : 'text-rs-text border-rs-border hover:border-rs-teal/50'
                    }`}
                  >
                    {u.RS_USER_ID}
                    <span className={`text-[9px] ${isSelected ? 'text-white/70' : u.USER_TYPE === 'System/Batch' ? 'text-purple-500' : 'text-rs-teal'}`}>
                      {u.USER_TYPE === 'System/Batch' ? '(sys)' : ''}
                    </span>
                  </button>
                );
              })}
              {selectedUserIds.size > 0 && (
                <button onClick={() => setSelectedUserIds(new Set())} className="text-[11px] px-2 py-1 rounded-full text-rs-muted hover:text-rs-text underline">
                  Clear ({selectedUserIds.size})
                </button>
              )}
            </div>
          )}
        </div>

        {/* Chart + stats — client-wide (FACT_USAGE_METRICS) when no users
            selected, or the selection's own run activity/breakdown when
            one or more are picked. */}
        {selectedAggregate ? (
          <>
            <div>
              {chartLoading ? (
                <div className="h-40 flex items-center justify-center text-xs text-rs-muted">Loading…</div>
              ) : chartActivity.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-xs text-rs-muted">No run activity for this selection.</div>
              ) : (
                <RunActivityChart activity={chartActivity} height={220} />
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <StatTile label="Total Runs" value={formatNum(selectedAggregate.runCount)} />
              <StatTile label="Query Runs" value={formatNum(selectedAggregate.queryCount)} />
              <StatTile label="Forecast Runs" value={formatNum(selectedAggregate.forecastCount)} />
              <StatTile label="Active Days" value={formatNum(selectedAggregate.activeDays)} />
              <StatTile label="Loans" value={selectedAggregate.loanCount ? formatNum(selectedAggregate.loanCount) : '—'} />
              <StatTile label="Securities" value={selectedAggregate.securityCount ? formatNum(selectedAggregate.securityCount) : '—'} />
            </div>
            {selectedAggregate.securityTypes.length > 0 && (
              <div>
                <p className="text-[10px] text-rs-muted mb-1">Security type</p>
                <TypePills counts={Object.fromEntries(selectedAggregate.securityTypes)} />
              </div>
            )}
            {selectedAggregate.analyticsTypes.length > 0 && (
              <div>
                <p className="text-[10px] text-rs-muted mb-1">Forecast type</p>
                <TypePills counts={Object.fromEntries(selectedAggregate.analyticsTypes)} />
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <UsageChart accountId={accountId} clientId={clientId} onWindowChange={setChartWindow} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {METRICS.map((m) => (
                <StatTile
                  key={m.key}
                  label={`${m.label} (${chartWindow.lookbackLabel})`}
                  value={chartWindow.loading ? '…' : formatMetricValue(m, aggregateMetric(chartWindow.dailyRows, m))}
                />
              ))}
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
          </>
        )}

        {/* Per-user breakdown table — narrows to the current selection (or
            the type filter, when nothing is selected). Query/Forecast counts
            are individually drill-downable into that one user's daily runs. */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-rs-muted">User Breakdown</p>
            {selectedUserIds.size === 0 && (
              <div className="flex gap-1">
                {TYPE_FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setTypeFilter(f.key)}
                    className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                      typeFilter === f.key ? 'bg-rs-teal text-white border-rs-teal' : 'text-rs-muted border-rs-border hover:border-rs-teal/50'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {usersLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-8 bg-rs-surface rounded animate-pulse" />)}
            </div>
          ) : tableUsers.length === 0 ? (
            <p className="text-xs text-rs-muted">No user activity in this range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-rs-muted uppercase tracking-wide text-[10px] border-b border-rs-border">
                    <th className="text-left py-2 pr-2 font-semibold">User</th>
                    <th className="text-left py-2 pr-2 font-semibold">Type</th>
                    <th className="text-right py-2 pr-2 font-semibold">Runs</th>
                    <th className="text-right py-2 pr-2 font-semibold">Query</th>
                    <th className="text-right py-2 pr-2 font-semibold">Forecast</th>
                    <th className="text-right py-2 pr-2 font-semibold">Active Days</th>
                    <th className="text-right py-2 pr-2 font-semibold">Loans</th>
                    <th className="text-left py-2 pr-2 font-semibold">Security Type</th>
                    <th className="text-left py-2 pr-2 font-semibold">Forecast Type</th>
                    <th className="text-left py-2 font-semibold">Last Active</th>
                  </tr>
                </thead>
                <tbody>
                  {tableUsers.map((u) => {
                    const isExpanded = expandedUserId === u.RS_USER_ID;
                    return (
                      <Fragment key={u.RS_USER_ID}>
                        <tr className="border-b border-rs-border/50 hover:bg-rs-surface/60 transition-colors">
                          <td className="py-2 pr-2 text-rs-text font-medium">{u.RS_USER_ID}</td>
                          <td className="py-2 pr-2">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${u.USER_TYPE === 'System/Batch' ? 'bg-purple-100 text-purple-700' : 'bg-teal-50 text-rs-teal'}`}>
                              {u.USER_TYPE === 'System/Batch' ? 'Sys/Batch' : 'User'}
                            </span>
                          </td>
                          <td className="py-2 pr-2 text-right text-rs-text font-medium">{formatNum(u.RUN_COUNT)}</td>
                          <td className="py-2 pr-2 text-right">
                            <button onClick={() => setExpandedUserId(isExpanded ? null : u.RS_USER_ID)} className="text-rs-teal font-medium hover:underline">
                              {formatNum(u.QUERY_COUNT)}
                            </button>
                          </td>
                          <td className="py-2 pr-2 text-right">
                            <button onClick={() => setExpandedUserId(isExpanded ? null : u.RS_USER_ID)} className="text-amber-600 font-medium hover:underline">
                              {formatNum(u.FORECAST_COUNT)}
                            </button>
                          </td>
                          <td className="py-2 pr-2 text-right text-rs-muted">{formatNum(u.ACTIVE_DAYS)}</td>
                          <td className="py-2 pr-2 text-right text-rs-muted">{u.LOAN_COUNT ? formatNum(u.LOAN_COUNT) : '—'}</td>
                          <td className="py-2 pr-2 max-w-[220px]"><TypePills counts={u.SECURITY_TYPES} /></td>
                          <td className="py-2 pr-2 max-w-[220px]"><TypePills counts={u.ANALYTICS_TYPES} /></td>
                          <td className="py-2 text-rs-muted whitespace-nowrap">{relativeDate(u.LAST_ACTIVE)}</td>
                        </tr>
                        {isExpanded && (
                          <ActivityRow userId={u.RS_USER_ID} accountId={accountId} clientId={clientId} daysBack={usersDaysBack} colSpan={10} />
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </SlidePanel>
  );
}
