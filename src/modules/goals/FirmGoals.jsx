import { useState, useMemo } from 'react';
import { format, getMonth, getYear } from 'date-fns';
import {
  ChevronDownIcon, ChevronUpIcon,
  PencilIcon, CheckIcon, XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { fetchClosedOppsInYear } from '../../datasources/salesforce';
import { useSalesforceQuery } from '../../hooks/useSalesforceQuery';
import { useRepFilter } from '../../hooks/useRepFilter';
import DealDetailPanel from '../../components/common/DealDetailPanel';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorState from '../../components/common/ErrorState';
import { useDashboard } from '../../context/DashboardContext';

const DEAL_TYPES = ['New Account', 'Upsell', 'Cross-Sell'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const TYPE_STYLE = {
  'New Account': { dot: 'bg-rs-teal',    accent: 'text-rs-teal',    badge: 'bg-rs-teal/10 text-rs-teal',    color: '#0C8EA3' },
  'Upsell':      { dot: 'bg-amber-400',  accent: 'text-amber-700',  badge: 'bg-amber-50 text-amber-700',    color: '#FBBF24' },
  'Cross-Sell':  { dot: 'bg-green-500',  accent: 'text-green-700',  badge: 'bg-green-50 text-green-700',    color: '#22C55E' },
};

function loadGoals(year) {
  try {
    const s = JSON.parse(localStorage.getItem('firmGoals') || '{}');
    return s[String(year)] || { 'New Account': 0, 'Upsell': 0, 'Cross-Sell': 0 };
  } catch { return { 'New Account': 0, 'Upsell': 0, 'Cross-Sell': 0 }; }
}
function persistGoals(year, goals) {
  try {
    const s = JSON.parse(localStorage.getItem('firmGoals') || '{}');
    s[String(year)] = goals;
    localStorage.setItem('firmGoals', JSON.stringify(s));
  } catch {}
}

function formatM(v) {
  if (!v) return '$0';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${v}`;
}
function formatFull(v) {
  if (!v && v !== 0) return '—';
  return `$${Math.round(v).toLocaleString()}`;
}
function pct(actual, goal) {
  return goal > 0 ? Math.round(actual / goal * 100) : 0;
}
function progressColor(p) {
  if (p >= 100) return 'bg-green-500';
  if (p >= 75)  return 'bg-amber-400';
  return 'bg-rs-teal';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypeGoalChip({ type, actual, goal, deals }) {
  const style = TYPE_STYLE[type];
  const p = pct(actual, goal);
  return (
    <div className="flex-1 px-4 py-3 border-r border-rs-border last:border-r-0">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
        <span className={`text-xs font-semibold ${style.accent}`}>{type}</span>
      </div>
      <div className="text-sm font-bold text-rs-text">{formatM(actual)}</div>
      {goal > 0 ? (
        <>
          <div className="text-[11px] text-rs-muted mb-1.5">of {formatM(goal)} · {p}%</div>
          <div className="h-1.5 rounded-full bg-rs-border overflow-hidden">
            <div className={`h-full rounded-full transition-all ${progressColor(p)}`} style={{ width: `${Math.min(p, 100)}%` }} />
          </div>
        </>
      ) : (
        <div className="text-[11px] text-rs-muted">No goal set</div>
      )}
      <div className="text-[11px] text-rs-muted mt-1">{deals} deal{deals !== 1 ? 's' : ''}</div>
    </div>
  );
}

function TotalChip({ actual, goal, deals }) {
  const p = pct(actual, goal);
  return (
    <div className="flex-1 px-4 py-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-xs font-semibold text-rs-text">Total Firm</span>
      </div>
      <div className="text-sm font-bold text-rs-teal">{formatM(actual)}</div>
      {goal > 0 ? (
        <>
          <div className="text-[11px] text-rs-muted mb-1.5">of {formatM(goal)} · <span className={`font-semibold ${p >= 100 ? 'text-green-600' : p >= 75 ? 'text-amber-600' : 'text-rs-teal'}`}>{p}%</span></div>
          <div className="h-1.5 rounded-full bg-rs-border overflow-hidden">
            <div className={`h-full rounded-full transition-all ${progressColor(p)}`} style={{ width: `${Math.min(p, 100)}%` }} />
          </div>
        </>
      ) : (
        <div className="text-[11px] text-rs-muted">No goal set</div>
      )}
      <div className="text-[11px] text-rs-muted mt-1">{deals} deals closed</div>
    </div>
  );
}

function EditGoalsPanel({ year, goals, onSave, onCancel }) {
  const [draft, setDraft] = useState({
    'New Account': goals['New Account'] ? String(goals['New Account'] / 1_000_000) : '',
    'Upsell':      goals['Upsell']      ? String(goals['Upsell'] / 1_000_000)      : '',
    'Cross-Sell':  goals['Cross-Sell']  ? String(goals['Cross-Sell'] / 1_000_000)  : '',
  });

  return (
    <div className="px-4 py-4 bg-rs-surface border-b border-rs-border">
      <p className="text-xs font-semibold text-rs-text mb-3">Set {year} ARR Goals (in $M)</p>
      <div className="flex flex-wrap gap-6 items-end">
        {DEAL_TYPES.map(type => {
          const style = TYPE_STYLE[type];
          return (
            <div key={type} className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-medium text-rs-muted">
                <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                {type}
              </label>
              <div className="flex items-center gap-1 border border-rs-border rounded-lg px-2 py-1.5 bg-white focus-within:border-rs-teal transition-colors">
                <span className="text-xs text-rs-muted">$</span>
                <input
                  type="number" min="0" step="0.1"
                  value={draft[type]}
                  onChange={e => setDraft(d => ({ ...d, [type]: e.target.value }))}
                  className="w-20 text-sm text-rs-text focus:outline-none bg-transparent"
                  placeholder="0.0"
                />
                <span className="text-xs text-rs-muted">M</span>
              </div>
            </div>
          );
        })}
        <div className="flex gap-2">
          <button
            onClick={() => onSave({
              'New Account': parseFloat(draft['New Account'] || 0) * 1_000_000,
              'Upsell':      parseFloat(draft['Upsell']      || 0) * 1_000_000,
              'Cross-Sell':  parseFloat(draft['Cross-Sell']  || 0) * 1_000_000,
            })}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rs-teal text-white text-xs font-medium rounded-lg hover:bg-rs-teal/90 transition-colors"
          >
            <CheckIcon className="h-3.5 w-3.5" />
            Save
          </button>
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-rs-border text-xs text-rs-muted rounded-lg hover:text-rs-text transition-colors"
          >
            <XMarkIcon className="h-3.5 w-3.5" />
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function GoalGroupCard({ type, deals, goal, onDealClick }) {
  const [expanded, setExpanded] = useState(true);
  const style = TYPE_STYLE[type];
  const actual = deals.reduce((s, d) => s + (d.Annual_Recurring_Revenue_ARR__c || 0), 0);
  const p = pct(actual, goal);

  return (
    <div className="rounded-card border border-rs-border bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-rs-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${style.dot}`} />
            <h3 className={`text-sm font-semibold ${style.accent}`}>{type}</h3>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${style.badge}`}>
              {deals.length} deal{deals.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {goal > 0 ? (
              <span className="text-xs text-rs-muted font-medium">
                {formatM(actual)} / {formatM(goal)}{' '}
                <span className={`font-semibold ${p >= 100 ? 'text-green-600' : p >= 75 ? 'text-amber-600' : 'text-rs-teal'}`}>({p}%)</span>
              </span>
            ) : (
              <span className="text-xs text-rs-muted font-medium">{formatM(actual)} ARR</span>
            )}
            <button onClick={() => setExpanded(e => !e)} className="text-rs-muted hover:text-rs-text transition-colors">
              {expanded ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {goal > 0 && (
          <div className="h-1.5 rounded-full bg-rs-border overflow-hidden">
            <div className={`h-full rounded-full ${progressColor(p)}`} style={{ width: `${Math.min(p, 100)}%` }} />
          </div>
        )}
      </div>

      {expanded && (
        deals.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-rs-muted">No {type} deals closed this year</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  {['Account', 'Opportunity', 'Module', 'Owner', 'ARR', 'Close Date'].map(h => (
                    <th key={h} className="bg-rs-teal text-white px-3 py-2 text-left text-xs font-semibold tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deals.map(deal => (
                  <tr key={deal.Id} onClick={() => onDealClick(deal)} className="border-b border-rs-border hover:bg-rs-surface cursor-pointer transition-colors">
                    <td className="px-3 py-2 text-sm font-medium text-rs-text whitespace-nowrap">{deal.Account?.Name || '—'}</td>
                    <td className="px-3 py-2 text-sm text-rs-muted max-w-[200px] truncate">{deal.Name}</td>
                    <td className="px-3 py-2 text-xs text-rs-muted max-w-[160px] truncate">{deal.Primary_Module__c || '—'}</td>
                    <td className="px-3 py-2 text-sm text-rs-muted whitespace-nowrap">{deal.Owner?.Name || '—'}</td>
                    <td className="px-3 py-2 text-sm font-medium text-rs-text whitespace-nowrap">{formatFull(deal.Annual_Recurring_Revenue_ARR__c)}</td>
                    <td className="px-3 py-2 text-sm text-rs-muted whitespace-nowrap">
                      {deal.CloseDate ? format(new Date(deal.CloseDate + 'T00:00:00'), 'MMM d') : '—'}
                    </td>
                  </tr>
                ))}
                <tr className="bg-rs-surface border-t-2 border-rs-border font-semibold">
                  <td className="px-3 py-2 text-xs text-rs-muted" colSpan={4}>Subtotal</td>
                  <td className="px-3 py-2 text-sm text-rs-text">{formatFull(actual)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FirmGoals() {
  const { triggerRefresh } = useDashboard();
  const currentYear = new Date().getFullYear();
  const selectedYear = currentYear;
  const [goals, setGoals] = useState(() => loadGoals(currentYear));
  const [editOpen, setEditOpen] = useState(false);
  const [activeDeal, setActiveDeal] = useState(null);

  const queryFn = useMemo(() => () => fetchClosedOppsInYear(selectedYear), [selectedYear]);
  const { data: rawData, loading, error } = useSalesforceQuery(queryFn);
  const filtered = useRepFilter(rawData);

  const handleSaveGoals = (newGoals) => {
    persistGoals(selectedYear, newGoals);
    setGoals(newGoals);
    setEditOpen(false);
  };

  const totalGoal = (goals['New Account'] || 0) + (goals['Upsell'] || 0) + (goals['Cross-Sell'] || 0);

  const { groups, summary, monthData, cumulativeData } = useMemo(() => {
    const won = (filtered || []).filter(d => d.IsWon && DEAL_TYPES.includes(d.Type));
    const groups = Object.fromEntries(DEAL_TYPES.map(t => [t, won.filter(d => d.Type === t)]));
    const summary = {
      deals: won.length,
      arr: won.reduce((s, d) => s + (d.Annual_Recurring_Revenue_ARR__c || 0), 0),
    };

    const now = new Date();
    const curMonth = selectedYear === currentYear ? getMonth(now) : 11;

    const monthData = MONTHS.map((label, i) => {
      const md = won.filter(d => d.CloseDate && new Date(d.CloseDate + 'T00:00:00').getMonth() === i);
      return {
        label,
        newAccount: md.filter(d => d.Type === 'New Account').reduce((s, d) => s + (d.Annual_Recurring_Revenue_ARR__c || 0), 0),
        upsell:     md.filter(d => d.Type === 'Upsell').reduce((s, d) => s + (d.Annual_Recurring_Revenue_ARR__c || 0), 0),
        crossSell:  md.filter(d => d.Type === 'Cross-Sell').reduce((s, d) => s + (d.Annual_Recurring_Revenue_ARR__c || 0), 0),
      };
    });

    let cum = 0;
    const cumulativeData = monthData.map((m, i) => {
      cum += m.newAccount + m.upsell + m.crossSell;
      return {
        label: m.label,
        actual:    i <= curMonth ? cum : null,
        goalPace:  totalGoal > 0 ? Math.round((i + 1) / 12 * totalGoal) : null,
      };
    });

    return { groups, summary, monthData, cumulativeData };
  }, [filtered, totalGoal, selectedYear, currentYear]);

  if (loading) return <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>;
  if (error)   return <ErrorState message={error} onRetry={triggerRefresh} />;

  const curMonthLabel = selectedYear === currentYear ? MONTHS[getMonth(new Date())] : null;

  return (
    <div>
      {/* ── Summary card ─────────────────────────────────────────────────── */}
      <div className="rounded-card border border-rs-border bg-white mb-6 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-rs-border">
          <div>
            <h2 className="text-sm font-semibold text-rs-text">{selectedYear} Firm Revenue Goals</h2>
            <p className="text-[11px] text-rs-muted mt-0.5">Closed ARR tracked against annual targets</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditOpen(o => !o)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                editOpen ? 'bg-rs-teal/10 text-rs-teal border-rs-teal/30' : 'text-rs-muted border-rs-border hover:text-rs-text'
              }`}
            >
              <PencilIcon className="h-3.5 w-3.5" />
              Edit Goals
            </button>
          </div>
        </div>

        {editOpen && (
          <EditGoalsPanel
            year={selectedYear}
            goals={goals}
            onSave={handleSaveGoals}
            onCancel={() => setEditOpen(false)}
          />
        )}

        <div className="flex divide-x divide-rs-border">
          {DEAL_TYPES.map(type => (
            <TypeGoalChip
              key={type}
              type={type}
              actual={groups[type]?.reduce((s, d) => s + (d.Annual_Recurring_Revenue_ARR__c || 0), 0) || 0}
              goal={goals[type] || 0}
              deals={groups[type]?.length || 0}
            />
          ))}
          <TotalChip actual={summary.arr} goal={totalGoal} deals={summary.deals} />
        </div>
      </div>

      {/* ── Charts ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        {/* Cumulative ARR vs Goal (3/5) */}
        <div className="col-span-3 rounded-card border border-rs-border bg-white p-4">
          <h3 className="text-sm font-semibold text-rs-text mb-0.5">Cumulative ARR vs Goal</h3>
          <p className="text-[11px] text-rs-muted mb-3">Running total vs annual target pace</p>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={cumulativeData} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#858C9C' }} axisLine={false} tickLine={false} />
              <YAxis hide />
              {curMonthLabel && (
                <ReferenceLine x={curMonthLabel} stroke="#0C8EA3" strokeDasharray="3 3" strokeOpacity={0.4} label={{ value: 'Today', position: 'top', fontSize: 9, fill: '#0C8EA3' }} />
              )}
              <Tooltip
                cursor={{ stroke: '#DADEE5', strokeWidth: 1 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const actual   = payload.find(p => p.dataKey === 'actual')?.value;
                  const goalPace = payload.find(p => p.dataKey === 'goalPace')?.value;
                  return (
                    <div className="bg-white border border-rs-border rounded-lg px-3 py-2 shadow-sm text-xs">
                      <p className="font-semibold text-rs-text mb-1">{label}</p>
                      {actual    != null && <p className="text-rs-teal">Actual: {formatM(actual)}</p>}
                      {goalPace  != null && totalGoal > 0 && <p className="text-rs-muted">Goal pace: {formatM(goalPace)}</p>}
                    </div>
                  );
                }}
              />
              {totalGoal > 0 && (
                <Line dataKey="goalPace" stroke="#858C9C" strokeDasharray="5 5" strokeWidth={1.5} dot={false} connectNulls name="Goal Pace" />
              )}
              <Line dataKey="actual" stroke="#0C8EA3" strokeWidth={2.5} dot={false} connectNulls={false} name="Actual" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly stacked bars (2/5) */}
        <div className="col-span-2 rounded-card border border-rs-border bg-white p-4">
          <h3 className="text-sm font-semibold text-rs-text mb-0.5">Monthly ARR by Type</h3>
          <p className="text-[11px] text-rs-muted mb-3">Closed ARR per month</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%">
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#858C9C' }} axisLine={false} tickLine={false} />
              <YAxis hide />
              {totalGoal > 0 && (
                <ReferenceLine y={totalGoal / 12} stroke="#858C9C" strokeDasharray="4 4" strokeOpacity={0.6} />
              )}
              <Tooltip
                cursor={{ fill: 'rgba(12,142,163,0.06)' }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
                  if (total === 0) return null;
                  return (
                    <div className="bg-white border border-rs-border rounded-lg px-3 py-2 shadow-sm text-xs">
                      <p className="font-semibold text-rs-text mb-1">{label}</p>
                      {payload.map(p => p.value > 0 && (
                        <p key={p.dataKey} style={{ color: p.fill }}>{p.name}: {formatM(p.value)}</p>
                      ))}
                      <p className="text-rs-text font-semibold mt-1 border-t border-rs-border pt-1">Total: {formatM(total)}</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="newAccount" stackId="a" fill="#0C8EA3" name="New Account" />
              <Bar dataKey="upsell"     stackId="a" fill="#FBBF24" name="Upsell" />
              <Bar dataKey="crossSell"  stackId="a" fill="#22C55E" name="Cross-Sell" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Type group cards ──────────────────────────────────────────────── */}
      <div className="space-y-4">
        {DEAL_TYPES.map(type => (
          <GoalGroupCard
            key={type}
            type={type}
            deals={groups[type] || []}
            goal={goals[type] || 0}
            onDealClick={setActiveDeal}
          />
        ))}
      </div>

      {activeDeal && (
        <DealDetailPanel deal={activeDeal} onClose={() => setActiveDeal(null)} />
      )}
    </div>
  );
}
