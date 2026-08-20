import { useState, useMemo } from 'react';
import { differenceInDays } from 'date-fns';
import { fetchOpenRenewalOpps, fetchClosedLostRenewalOpps, fetchAllAccounts } from '../../datasources/salesforce';
import { isTrackedTier, isCurrentClientType } from '../../config/accountTier';
import { fetchMaxioData } from '../../datasources/maxio';
import { buildMaxioBilling, buildMaxioArrSeries } from '../../lib/externalDataMatch';
import { useSalesforceQuery } from '../../hooks/useSalesforceQuery';
import { useRepFilter } from '../../hooks/useRepFilter';
import { useDashboard } from '../../context/DashboardContext';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorState from '../../components/common/ErrorState';
import KpiCard from '../../components/common/KpiCard';
import UpcomingRenewalsList from './UpcomingRenewalsList';
import ChurnedClientsList from './ChurnedClientsList';
import ChurnRateChart from './ChurnRateChart';
import AtRiskClients from './AtRiskClients';
import ChurnReasonBreakdown from './ChurnReasonBreakdown';

function formatARR(v) {
  if (!v && v !== 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

export default function RenewalsPage() {
  const { triggerRefresh } = useDashboard();
  const [activeTab, setActiveTab] = useState('renewals');

  const renewalOppsQ   = useSalesforceQuery(fetchOpenRenewalOpps);
  const churnedOppsQ   = useSalesforceQuery(fetchClosedLostRenewalOpps);
  const accountsQ      = useSalesforceQuery(fetchAllAccounts);
  const maxioQ         = useSalesforceQuery(fetchMaxioData);

  const filteredRenewalOpps = useRepFilter(renewalOppsQ.data ?? []);
  const filteredChurnedOpps = useRepFilter(churnedOppsQ.data ?? []);

  // Build per-account Maxio billing from raw datasets
  const maxioBillingByAccountId = useMemo(() => {
    const accounts = accountsQ.data ?? [];
    const maxio = maxioQ.data;
    if (!maxio || !accounts.length) return new Map();

    const trackedAccounts = accounts.filter(a => isTrackedTier(a.AccountType_Tier__c));

    // Primary: sf_id direct match (Maxio customer FK to SF Account.Id)
    const sfIdMatchedCustomers = maxio.customers.filter(c => c.sf_id);
    const sfIdSet = new Set(sfIdMatchedCustomers.map(c => c.sf_id));
    const directMatchAccounts = trackedAccounts.filter(a => sfIdSet.has(a.Id));

    // Secondary: fuzzy name match limited to confirmed Platform Clients
    // (Type = 'Customer' | 'Both Platform and Consulting Client' AND ARR > 0).
    // This is the same gate as the Current Clients page, so the pool stays
    // small (~current active clients) and avoids over-matching.
    // Use Type-only gate (no ARR threshold) since saasoptics__arr_at_end_of_month__c
    // is stale for recently-renewed clients like Cross Country / Aperio.
    // Maxio active lines are the real gate — if no lines match, arr=0 and they're excluded below.
    const platformClientAccounts = trackedAccounts.filter(
      a => !sfIdSet.has(a.Id) && isCurrentClientType(a.Type)
    );

    const map = new Map();
    for (const acct of [...directMatchAccounts, ...platformClientAccounts]) {
      if (map.has(acct.Id)) continue;
      const useFuzzy = !sfIdSet.has(acct.Id);
      const billing = buildMaxioBilling({
        customers: maxio.customers,
        contracts: maxio.contracts,
        transactions: maxio.transactions,
        items: maxio.items,
        accountId: acct.Id,
        matchName: useFuzzy ? acct.Name : null,
      });
      if (billing.arr > 0 || billing.lines.some(l => l.isActive)) {
        map.set(acct.Id, { ...billing, accountName: acct.Name, accountId: acct.Id, owner: acct.Owner });
      }
    }
    return map;
  }, [accountsQ.data, maxioQ.data]);

  // One row per account sorted by next renewal date, matching the slide format
  const renewalRows = useMemo(() => {
    const today = new Date();
    const sfOppByAccountId = new Map();
    for (const opp of filteredRenewalOpps) {
      if (!sfOppByAccountId.has(opp.AccountId)) sfOppByAccountId.set(opp.AccountId, opp);
    }

    const rows = [];
    for (const [accountId, billing] of maxioBillingByAccountId) {
      const { lines, arr, nextRenewalDate, accountName, owner } = billing;
      const activeLines = lines.filter(l => l.isActive).sort((a, b) => (a.end_date || "").localeCompare(b.end_date || ""));
      if (!activeLines.length) continue;

      const daysUntilRenewal = nextRenewalDate
        ? differenceInDays(new Date(nextRenewalDate + 'T00:00:00'), today)
        : null;

      const hasManual = activeLines.some(l => !l.is_autorenewal);
      const sfOpp = sfOppByAccountId.get(accountId) ?? null;

      // ARR at risk = only the lines whose end_date matches the next renewal date,
      // not the sum of all active lines (which inflates multi-line accounts like GS).
      const renewalArr = activeLines
        .filter(l => l.end_date === nextRenewalDate)
        .reduce((s, l) => s + (Number(l.home_arr_amount) || 0), 0);

      rows.push({
        accountId,
        accountName,
        owner,
        arr,        // total account ARR — shown in the slide panel
        renewalArr, // ARR coming up for renewal — shown in the table
        nextRenewalDate,
        daysUntilRenewal,
        isAutoRenew: !hasManual,
        activeLines,
        sfOpp,
      });
    }
    return rows.sort((a, b) => (a.nextRenewalDate || '').localeCompare(b.nextRenewalDate || ''));
  }, [maxioBillingByAccountId, filteredRenewalOpps]);

  // All lines across all accounts for the ARR series chart
  const allMaxioLines = useMemo(() => {
    const lines = [];
    for (const billing of maxioBillingByAccountId.values()) {
      lines.push(...billing.lines);
    }
    return lines;
  }, [maxioBillingByAccountId]);

  const arrSeries = useMemo(() => buildMaxioArrSeries(allMaxioLines, 24), [allMaxioLines]);

  // At-risk accounts: aggregate per account from Maxio
  const atRiskRows = useMemo(() => {
    const today = new Date();
    const rows = [];
    for (const [, billing] of maxioBillingByAccountId) {
      const { lines, arr, nextRenewalDate, accountName, owner } = billing;
      const daysToRenewal = nextRenewalDate
        ? differenceInDays(new Date(nextRenewalDate + 'T00:00:00'), today)
        : null;
      const activeLines = lines.filter(l => l.isActive).sort((a, b) => (a.end_date || "").localeCompare(b.end_date || ""));
      const manualLines = activeLines.filter(l => !l.is_autorenewal);
      const cancelledLines = lines.filter(l => l.cancelled);

      let score = 0;
      if (manualLines.length > 0 && daysToRenewal != null && daysToRenewal <= 90) score += 3;
      if (manualLines.length > 0 && daysToRenewal != null && daysToRenewal <= 30) score += 2;
      if (daysToRenewal != null && daysToRenewal <= 30) score += 2;
      if (cancelledLines.length > 0) score += 2;

      if (score < 2) continue;

      const isAutoRenew = activeLines.length > 0 && manualLines.length === 0;
      rows.push({
        accountName,
        owner,
        arr,
        nextRenewalDate,
        daysToRenewal,
        isAutoRenew,
        cancelledCount: cancelledLines.length,
        score,
      });
    }
    return rows.sort((a, b) => b.score - a.score).slice(0, 50);
  }, [maxioBillingByAccountId]);

  // KPIs
  const kpis = useMemo(() => {
    const today = new Date();
    const currentYear = today.getFullYear();

    const upcomingArr = renewalRows
      .filter(r => r.daysUntilRenewal != null && r.daysUntilRenewal >= 0 && r.daysUntilRenewal <= 90)
      .reduce((s, r) => s + (r.renewalArr ?? r.arr ?? 0), 0);

    const due30 = renewalRows.filter(r => r.daysUntilRenewal != null && r.daysUntilRenewal >= 0 && r.daysUntilRenewal <= 30).length;

    const churnedYtd = filteredChurnedOpps
      .filter(o => o.CloseDate && o.CloseDate.startsWith(String(currentYear)))
      .reduce((s, o) => s + Number(o.Annual_Recurring_Revenue_ARR__c ?? o.Amount ?? 0), 0);

    const activeLines = allMaxioLines.filter(l => l.isActive);
    const autoRenewPct = activeLines.length
      ? Math.round((activeLines.filter(l => l.is_autorenewal).length / activeLines.length) * 100)
      : null;

    return { upcomingArr, due30, churnedYtd, autoRenewPct };
  }, [renewalRows, allMaxioLines, filteredChurnedOpps]);

  const loading = renewalOppsQ.loading || churnedOppsQ.loading || maxioQ.loading;
  const error = renewalOppsQ.error || churnedOppsQ.error || maxioQ.error;

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
      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <KpiCard title="Renewal ARR (90 days)" value={formatARR(kpis.upcomingArr)} />
        <KpiCard title="Renewals Due ≤ 30 days" value={kpis.due30} />
        <KpiCard title="ARR Churned YTD" value={formatARR(kpis.churnedYtd)} />
        <KpiCard title="Auto-Renew %" value={kpis.autoRenewPct != null ? `${kpis.autoRenewPct}%` : '—'} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6">
        {[['renewals', 'Renewals'], ['churn', 'Churn']].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setActiveTab(val)}
            className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
              activeTab === val
                ? 'bg-rs-teal text-white'
                : 'text-rs-muted hover:text-rs-text hover:bg-rs-surface'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'renewals' && (
        <>
          <UpcomingRenewalsList rows={renewalRows} />
          <AtRiskClients rows={atRiskRows} />
        </>
      )}

      {activeTab === 'churn' && (
        <>
          <ChurnRateChart churnedOpps={filteredChurnedOpps} arrSeries={arrSeries} />
          <div className="grid grid-cols-2 gap-6 mt-6">
            <ChurnReasonBreakdown opps={filteredChurnedOpps} />
            <ChurnedClientsList opps={filteredChurnedOpps} />
          </div>
        </>
      )}
    </div>
  );
}
