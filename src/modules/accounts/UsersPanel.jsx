import { useState, useEffect, useMemo, Fragment } from 'react';
import SlidePanel from '../../components/common/SlidePanel';
import StatTile from './StatTile';
import { fetchAccountUsers, fetchUserActivity } from '../../datasources/snowflake';

// Ported from client-health-app's Client Detail > Users tab — same source
// tables (RS_ANALYTICS_STATS_MASTER/RS_QUERY_STATS_MASTER/RS_ANALYTICS_STATS_INFO)
// and the same admin/support/batch heuristic for System/Batch vs End User.
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

function formatNum(v) {
  if (v === null || v === undefined) return '—';
  return Math.round(v).toLocaleString();
}

function relativeDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00' : dateStr);
  const diff = Math.floor((Date.now() - d) / 86400000);
  if (diff < 0 || diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 30) return `${diff}d ago`;
  return dateStr.slice(0, 10);
}

// RS_ANALYTICS_TYPE / RS_SECURITY_TYPE values can carry composite keys like
// "CASHFLOW;EdgeScenario=Base" — split on ';' and drop the EdgeScenario
// annotation, same client-side flattening client-health's page.tsx does
// before rendering these as count pills.
function flattenTypeCounts(obj) {
  const out = new Map();
  for (const [key, count] of Object.entries(obj || {})) {
    const label = key.split(';').find((part) => !/^EdgeScenario=/i.test(part)) || key;
    out.set(label, (out.get(label) || 0) + count);
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

function ActivityRow({ userId, accountId, clientId, daysBack, colSpan }) {
  const [activity, setActivity] = useState(null);

  useEffect(() => {
    setActivity(null);
    fetchUserActivity({ accountId, clientId, userId, daysBack })
      .then((data) => setActivity(data.activity || []))
      .catch(() => setActivity([]));
  }, [userId, accountId, clientId, daysBack]);

  const max = Math.max(1, ...(activity || []).map((r) => r.RUN_COUNT));

  return (
    <tr className="bg-rs-surface/40">
      <td colSpan={colSpan} className="px-3 py-3">
        {activity === null ? (
          <p className="text-xs text-rs-muted">Loading activity…</p>
        ) : activity.length === 0 ? (
          <p className="text-xs text-rs-muted">No forecast run activity in this range.</p>
        ) : (
          <div className="flex items-end gap-1 h-16">
            {activity.map((row) => (
              <div key={row.RUN_DATE} className="flex flex-col items-center gap-1 group relative" style={{ width: `${100 / activity.length}%` }}>
                <div
                  className="w-full bg-rs-teal/60 rounded-t hover:bg-rs-teal transition-colors"
                  style={{ height: `${Math.max(4, (row.RUN_COUNT / max) * 56)}px` }}
                  title={`${row.RUN_DATE}: ${row.RUN_COUNT} run${row.RUN_COUNT === 1 ? '' : 's'}`}
                />
              </div>
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}

export default function UsersPanel({ open, onClose, accountId, clientId }) {
  const [daysBack, setDaysBack] = useState('30');
  const [typeFilter, setTypeFilter] = useState('all');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedUserId, setExpandedUserId] = useState(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchAccountUsers({ accountId, clientId, daysBack })
      .then((data) => setUsers(data.users || []))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, [open, accountId, clientId, daysBack]);

  const filteredUsers = useMemo(
    () => (typeFilter === 'all' ? users : users.filter((u) => u.USER_TYPE === typeFilter)),
    [users, typeFilter]
  );

  const summary = useMemo(() => {
    const endUsers = users.filter((u) => u.USER_TYPE === 'End User');
    const systemUsers = users.filter((u) => u.USER_TYPE === 'System/Batch');
    return {
      active: users.length,
      end: endUsers.length,
      system: systemUsers.length,
      totalRuns: users.reduce((s, u) => s + (u.RUN_COUNT || 0), 0),
      lastActive: users.reduce((max, u) => (u.LAST_ACTIVE > max ? u.LAST_ACTIVE : max), ''),
    };
  }, [users]);

  return (
    <SlidePanel open={open} onClose={onClose} title="Users" width="min(80vw, 1300px)">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setDaysBack(r.key)}
                className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                  daysBack === r.key ? 'bg-rs-teal text-white border-rs-teal' : 'text-rs-muted border-rs-border hover:border-rs-teal/50'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
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
        </div>

        {loading ? (
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-14 bg-rs-surface rounded-lg animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            <StatTile label="Active Users" value={summary.active} />
            <StatTile label="End Users" value={summary.end} />
            <StatTile label="System/Batch" value={summary.system} />
            <StatTile label="Total Runs" value={formatNum(summary.totalRuns)} sublabel={summary.lastActive ? `Last: ${summary.lastActive}` : undefined} />
          </div>
        )}

        <p className="text-[11px] text-rs-muted italic">Click a Query or Forecast count to expand that user's daily run activity.</p>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-8 bg-rs-surface rounded animate-pulse" />)}
          </div>
        ) : filteredUsers.length === 0 ? (
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
                {filteredUsers.map((u) => {
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
                          <button
                            onClick={() => setExpandedUserId(isExpanded ? null : u.RS_USER_ID)}
                            className="text-rs-teal font-medium hover:underline"
                          >
                            {formatNum(u.QUERY_COUNT)}
                          </button>
                        </td>
                        <td className="py-2 pr-2 text-right">
                          <button
                            onClick={() => setExpandedUserId(isExpanded ? null : u.RS_USER_ID)}
                            className="text-amber-600 font-medium hover:underline"
                          >
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
                        <ActivityRow
                          userId={u.RS_USER_ID}
                          accountId={accountId}
                          clientId={clientId}
                          daysBack={daysBack}
                          colSpan={10}
                        />
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SlidePanel>
  );
}
