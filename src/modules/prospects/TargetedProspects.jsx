import { useState, useMemo } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import {
  fetchAllAccounts, fetchOpenOpportunities, fetchOppsYTD,
  fetchTargetedProspectActivities,
} from '../../datasources/salesforce';
import { useSalesforceQuery } from '../../hooks/useSalesforceQuery';
import { useDashboard } from '../../context/DashboardContext';
import { isTargetProspectTier } from '../../config/accountTier';
import { STAGE_MAP } from '../../config/salesStages';
import AccountView from '../accounts/AccountView';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorState from '../../components/common/ErrorState';

function formatARR(v) {
  if (!v) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${Math.round(v)}`;
}

function relativeDate(dateStr) {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr + 'T00:00:00');
  const diff = Math.floor((Date.now() - d) / 86400000);
  if (diff < 0) return '—';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 30) return `${diff}d ago`;
  if (diff < 365) return `${Math.floor(diff / 30)}mo ago`;
  return `${Math.floor(diff / 365)}yr ago`;
}

// ── Rollup: one row per target account, joining opps + activities ────────────

function buildRollups(targetAccounts, openOpps, wonOpps, activities) {
  const oppsByAccount = new Map();
  for (const o of openOpps || []) {
    if (!o.AccountId) continue;
    if (!oppsByAccount.has(o.AccountId)) oppsByAccount.set(o.AccountId, []);
    oppsByAccount.get(o.AccountId).push(o);
  }
  const wonByAccount = new Map();
  for (const o of wonOpps || []) {
    if (!o.IsWon || !o.AccountId) continue;
    if (!wonByAccount.has(o.AccountId)) wonByAccount.set(o.AccountId, []);
    wonByAccount.get(o.AccountId).push(o);
  }
  const tasksByAccount = new Map();
  for (const t of activities?.tasks || []) {
    if (!t.WhatId) continue;
    if (!tasksByAccount.has(t.WhatId)) tasksByAccount.set(t.WhatId, []);
    tasksByAccount.get(t.WhatId).push(t);
  }
  const eventsByAccount = new Map();
  for (const e of activities?.events || []) {
    if (!e.WhatId) continue;
    if (!eventsByAccount.has(e.WhatId)) eventsByAccount.set(e.WhatId, []);
    eventsByAccount.get(e.WhatId).push(e);
  }

  return targetAccounts.map((account) => {
    const openForAcct = oppsByAccount.get(account.Id) || [];
    const wonForAcct = wonByAccount.get(account.Id) || [];
    const tasksForAcct = tasksByAccount.get(account.Id) || [];
    const eventsForAcct = eventsByAccount.get(account.Id) || [];

    const activityDates = [
      ...tasksForAcct.map((t) => t.ActivityDate).filter(Boolean),
      ...eventsForAcct.map((e) => e.StartDateTime?.slice(0, 10)).filter(Boolean),
    ].sort((a, b) => b.localeCompare(a));

    let furthestStage = null;
    let furthestOrder = -1;
    for (const o of openForAcct) {
      const order = STAGE_MAP[o.StageName]?.order ?? -1;
      if (order > furthestOrder) {
        furthestOrder = order;
        furthestStage = o.StageName;
      }
    }

    return {
      account,
      openOpps: openForAcct,
      hasOpenOpp: openForAcct.length > 0,
      furthestStage,
      openArr: openForAcct.reduce((s, o) => s + (o.Annual_Recurring_Revenue_ARR__c ?? o.Amount ?? 0), 0),
      wonThisYear: wonForAcct.reduce((s, o) => s + (o.Annual_Recurring_Revenue_ARR__c ?? o.Amount ?? 0), 0),
      activityCount90d: tasksForAcct.length + eventsForAcct.length,
      lastActivityDate: activityDates[0] || null,
    };
  });
}

function bucketize(rollups) {
  const inPipeline = [];
  const engagedNoDeal = [];
  const noOutreach = [];
  for (const r of rollups) {
    if (r.hasOpenOpp) inPipeline.push(r);
    else if (r.activityCount90d > 0) engagedNoDeal.push(r);
    else noOutreach.push(r);
  }
  inPipeline.sort((a, b) => (STAGE_MAP[b.furthestStage]?.order ?? 0) - (STAGE_MAP[a.furthestStage]?.order ?? 0));
  engagedNoDeal.sort((a, b) => b.activityCount90d - a.activityCount90d);
  noOutreach.sort((a, b) => (b.lastActivityDate || '').localeCompare(a.lastActivityDate || ''));
  return { inPipeline, engagedNoDeal, noOutreach };
}

// ── Bucket card ───────────────────────────────────────────────────────────────

const BUCKET_CONFIG = {
  inPipeline: {
    label: 'In Active Pipeline',
    description: 'Target accounts with at least one open opportunity',
    headerBg: 'bg-teal-50',
    dotCls: 'bg-rs-teal',
    accentCls: 'text-rs-teal',
    badgeCls: 'bg-rs-teal/10 text-rs-teal',
    emptyMsg: 'No target accounts have an open opportunity yet',
    showStage: true,
  },
  engagedNoDeal: {
    label: 'Engaged, No Deal Yet',
    description: 'Outreach logged in the last 90 days, no open opportunity',
    headerBg: 'bg-amber-50',
    dotCls: 'bg-amber-500',
    accentCls: 'text-amber-700',
    badgeCls: 'bg-amber-100 text-amber-700',
    emptyMsg: 'No target accounts are mid-outreach without a deal',
  },
  noOutreach: {
    label: 'No Outreach in 90 Days',
    description: 'No task or event logged against the account in the last 90 days',
    headerBg: 'bg-gray-50',
    dotCls: 'bg-gray-400',
    accentCls: 'text-rs-muted',
    badgeCls: 'bg-gray-100 text-rs-muted',
    emptyMsg: 'Every target account has recent outreach',
  },
};

function AccountRow({ rollup, showStage, onClick }) {
  const { account, furthestStage, openArr, lastActivityDate } = rollup;
  return (
    <tr
      onClick={() => onClick(account.Id)}
      className="border-b border-rs-border hover:bg-rs-surface cursor-pointer transition-colors"
    >
      <td className="px-3 py-2 text-sm font-medium text-rs-text whitespace-nowrap">{account.Name}</td>
      <td className="px-3 py-2">
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
          account.AccountType_Tier__c === 'Tier 1 Prospect' ? 'bg-rs-teal/10 text-rs-teal' : 'bg-slate-100 text-slate-600'
        }`}>
          {account.AccountType_Tier__c}
        </span>
      </td>
      <td className="px-3 py-2 text-sm text-rs-muted whitespace-nowrap">{account.Owner?.Name || '—'}</td>
      <td className="px-3 py-2 text-xs text-rs-muted whitespace-nowrap">{account.Industry || '—'}</td>
      <td className="px-3 py-2 text-sm text-rs-muted whitespace-nowrap">{relativeDate(lastActivityDate)}</td>
      {showStage && (
        <td className="px-3 py-2">
          <span className="text-xs bg-rs-teal/10 text-rs-teal px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
            {furthestStage || '—'}
          </span>
        </td>
      )}
      <td className="px-3 py-2 text-sm font-medium text-rs-text whitespace-nowrap">
        {openArr > 0 ? formatARR(openArr) : '—'}
      </td>
    </tr>
  );
}

function BucketCard({ type, rollups, onAccountClick }) {
  const [expanded, setExpanded] = useState(true);
  const cfg = BUCKET_CONFIG[type];
  const totalArr = rollups.reduce((s, r) => s + r.openArr, 0);

  const stageBreakdown = useMemo(() => {
    if (!cfg.showStage) return [];
    const counts = new Map();
    for (const r of rollups) {
      const key = r.furthestStage || 'Other';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries()).sort(
      (a, b) => (STAGE_MAP[b[0]]?.order ?? 0) - (STAGE_MAP[a[0]]?.order ?? 0)
    );
  }, [rollups, cfg.showStage]);

  const columns = cfg.showStage
    ? ['Account', 'Tier', 'Owner', 'Industry', 'Last Activity', 'Stage', 'Open ARR']
    : ['Account', 'Tier', 'Owner', 'Industry', 'Last Activity', 'Open ARR'];

  return (
    <div className="rounded-card border border-rs-border bg-white overflow-hidden">
      <div className={`flex items-center justify-between px-4 py-3 border-b border-rs-border ${cfg.headerBg}`}>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${cfg.dotCls}`} />
          <div>
            <h3 className={`text-sm font-semibold ${cfg.accentCls}`}>{cfg.label}</h3>
            <p className="text-[10px] text-rs-muted mt-0.5">{cfg.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {stageBreakdown.length > 0 && (
            <span className="text-[11px] text-rs-muted hidden lg:inline">
              {stageBreakdown.map(([stage, count], i) => (
                <span key={stage}>
                  {i > 0 && ' · '}{count} {stage}
                </span>
              ))}
            </span>
          )}
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badgeCls}`}>
            {rollups.length} account{rollups.length !== 1 ? 's' : ''}
          </span>
          {totalArr > 0 && (
            <span className="text-xs font-semibold text-rs-text">{formatARR(totalArr)}</span>
          )}
          <button onClick={() => setExpanded((e) => !e)} className="text-rs-muted hover:text-rs-text transition-colors">
            {expanded ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        rollups.length === 0 ? (
          <div className="px-4 py-5 text-center text-xs text-rs-muted">{cfg.emptyMsg}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  {columns.map((h) => (
                    <th key={h} className="bg-rs-teal text-white px-3 py-2 text-left text-xs font-semibold tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rollups.map((r) => (
                  <AccountRow key={r.account.Id} rollup={r} showStage={cfg.showStage} onClick={onAccountClick} />
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

// ── Per-rep breakdown ─────────────────────────────────────────────────────────

function RepBreakdown({ rollups }) {
  const rows = useMemo(() => {
    const byOwner = new Map();
    for (const r of rollups) {
      const ownerId = r.account.OwnerId;
      if (!ownerId) continue;
      if (!byOwner.has(ownerId)) {
        byOwner.set(ownerId, { ownerName: r.account.Owner?.Name || '—', tier1: 0, tier2: 0, engaged: 0, inPipeline: 0, openArr: 0 });
      }
      const s = byOwner.get(ownerId);
      if (r.account.AccountType_Tier__c === 'Tier 1 Prospect') s.tier1 += 1;
      if (r.account.AccountType_Tier__c === 'Tier 2 Prospect') s.tier2 += 1;
      if (r.hasOpenOpp) {
        s.inPipeline += 1;
        s.openArr += r.openArr;
      } else if (r.activityCount90d > 0) {
        s.engaged += 1;
      }
    }
    return Array.from(byOwner.values()).sort((a, b) => (b.tier1 + b.tier2) - (a.tier1 + a.tier2));
  }, [rollups]);

  if (rows.length === 0) return null;

  const columns = [
    { key: 'ownerName', label: 'Rep' },
    { key: 'tier1', label: 'Tier 1' },
    { key: 'tier2', label: 'Tier 2' },
    { key: 'engaged', label: 'Engaged (90d)' },
    { key: 'inPipeline', label: 'In Pipeline' },
    { key: 'openArr', label: 'Open ARR', format: formatARR },
  ];

  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold text-rs-text mb-3">Per-Rep Breakdown</h2>
      <div className="rounded-card border border-rs-border overflow-hidden overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} className="bg-rs-teal text-white px-3 py-2 text-left text-xs font-semibold tracking-wide whitespace-nowrap">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.ownerName} className="border-b border-rs-border hover:bg-[#E8EBF2] transition-colors">
                {columns.map((col) => (
                  <td key={col.key} className="px-3 py-2 text-rs-text whitespace-nowrap">
                    {col.format ? col.format(row[col.key]) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TargetedProspects() {
  const { selectedRep, triggerRefresh } = useDashboard();
  const [activeAccountId, setActiveAccountId] = useState(null);

  const accountsQ = useSalesforceQuery(fetchAllAccounts);
  const openOppsQ = useSalesforceQuery(fetchOpenOpportunities);
  const wonOppsQ = useSalesforceQuery(fetchOppsYTD);

  const targetAccounts = useMemo(
    () => (accountsQ.data || []).filter((a) => isTargetProspectTier(a.AccountType_Tier__c)),
    [accountsQ.data]
  );
  const idsKey = useMemo(() => targetAccounts.map((a) => a.Id).sort().join(','), [targetAccounts]);
  const activitiesQueryFn = useMemo(
    () => () => fetchTargetedProspectActivities(targetAccounts.map((a) => a.Id)),
    [idsKey]
  );
  const activitiesQ = useSalesforceQuery(activitiesQueryFn, [idsKey]);

  const loading = accountsQ.loading || openOppsQ.loading || wonOppsQ.loading || activitiesQ.loading;
  const error = accountsQ.error || openOppsQ.error || wonOppsQ.error || activitiesQ.error;

  const allRollups = useMemo(
    () => buildRollups(targetAccounts, openOppsQ.data, wonOppsQ.data, activitiesQ.data),
    [targetAccounts, openOppsQ.data, wonOppsQ.data, activitiesQ.data]
  );

  const scopedRollups = useMemo(() => {
    if (selectedRep === 'all') return allRollups;
    return allRollups.filter((r) => r.account.OwnerId === selectedRep);
  }, [allRollups, selectedRep]);

  const { inPipeline, engagedNoDeal, noOutreach } = useMemo(() => bucketize(scopedRollups), [scopedRollups]);

  if (activeAccountId) {
    return <AccountView accountId={activeAccountId} onBack={() => setActiveAccountId(null)} />;
  }

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

  const tier1Count = scopedRollups.filter((r) => r.account.AccountType_Tier__c === 'Tier 1 Prospect').length;
  const tier2Count = scopedRollups.filter((r) => r.account.AccountType_Tier__c === 'Tier 2 Prospect').length;
  const totalCount = scopedRollups.length;
  const engagedCount = inPipeline.length + engagedNoDeal.length;
  const engagedPct = totalCount ? Math.round((engagedCount / totalCount) * 100) : 0;
  const totalOpenArr = inPipeline.reduce((s, r) => s + r.openArr, 0);

  return (
    <div>
      {/* ── Overview card ───────────────────────────────────────────────── */}
      <div className="rounded-card border border-rs-border bg-white p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-rs-text">Progress Against Targeted Prospects</h2>
            <p className="text-[11px] text-rs-muted mt-0.5">Tier 1 / Tier 2 assigned prospects · outreach in the last 90 days</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-rs-text">{totalCount}</span>
            <span className="text-sm text-rs-muted">assigned</span>
            <span className="w-px h-6 bg-rs-border mx-2" />
            <span className="text-2xl font-bold text-rs-teal">{engagedPct}%</span>
            <span className="text-sm text-rs-muted">engaged</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 bg-rs-surface border border-rs-border rounded-lg px-3 py-2">
            <span className="text-xs font-semibold text-rs-teal">{tier1Count}</span>
            <span className="text-xs text-rs-muted">Tier 1 Prospects</span>
          </div>
          <div className="flex items-center gap-2 bg-rs-surface border border-rs-border rounded-lg px-3 py-2">
            <span className="text-xs font-semibold text-slate-600">{tier2Count}</span>
            <span className="text-xs text-rs-muted">Tier 2 Prospects</span>
          </div>
          <div className="flex items-center gap-2 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-rs-teal" />
            <span className="text-xs font-semibold text-rs-teal">{inPipeline.length}</span>
            <span className="text-xs text-rs-muted">In Active Pipeline</span>
          </div>
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-xs font-semibold text-amber-700">{engagedNoDeal.length}</span>
            <span className="text-xs text-rs-muted">Engaged, No Deal Yet</span>
          </div>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-gray-400" />
            <span className="text-xs font-semibold text-rs-muted">{noOutreach.length}</span>
            <span className="text-xs text-rs-muted">No Outreach in 90 Days</span>
          </div>
          {totalOpenArr > 0 && (
            <div className="flex items-center gap-2 bg-rs-surface border border-rs-border rounded-lg px-3 py-2">
              <span className="text-xs font-semibold text-rs-text">{formatARR(totalOpenArr)}</span>
              <span className="text-xs text-rs-muted">open pipeline ARR</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Three engagement buckets ─────────────────────────────────────── */}
      <div className="space-y-4">
        <BucketCard type="inPipeline" rollups={inPipeline} onAccountClick={setActiveAccountId} />
        <BucketCard type="engagedNoDeal" rollups={engagedNoDeal} onAccountClick={setActiveAccountId} />
        <BucketCard type="noOutreach" rollups={noOutreach} onAccountClick={setActiveAccountId} />
      </div>

      {selectedRep === 'all' && <RepBreakdown rollups={allRollups} />}
    </div>
  );
}
