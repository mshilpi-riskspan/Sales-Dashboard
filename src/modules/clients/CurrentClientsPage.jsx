import { useState, useEffect, useRef, useMemo } from 'react';
import { MagnifyingGlassIcon, ChevronDownIcon, Squares2X2Icon } from '@heroicons/react/24/outline';
import { useSalesforceQuery } from '../../hooks/useSalesforceQuery';
import { useDashboard } from '../../context/DashboardContext';
import { fetchAllAccounts, fetchOpenOpportunities } from '../../datasources/salesforce';
import { fetchSnowflakeClients, fetchCurrentClientsSnowflakeData } from '../../datasources/snowflake';
import { fetchFreshdeskData } from '../../datasources/freshdesk';
import { fetchJiraData } from '../../datasources/jira';
import { fetchAstronomerData } from '../../datasources/astronomer';
import { mergeCurrentClients } from '../../lib/currentClientsMerge';
import { isClientTier, isCurrentClient, isTrackedTier } from '../../config/accountTier';
import { COLUMN_CATALOG, COLUMN_GROUPS, DEFAULT_VISIBLE_COLUMNS } from './columnCatalog';
import DataTable from '../../components/common/DataTable';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorState from '../../components/common/ErrorState';
import AccountView from '../accounts/AccountView';

const VISIBLE_COLUMNS_KEY = 'currentClientsVisibleColumns';

// Safety backstop, not the primary fix — the primary fix is filtering down
// to tracked-tier accounts (or search matches) *before* mergeCurrentClients
// runs, since the expensive part is the per-account Freshdesk/Jira/
// Astronomer matching inside the merge, not the table render. This just
// guards against a pathologically broad search (e.g. a single common
// letter) still handing the merge thousands of rows. Set comfortably above
// the ~1,200 tracked Tier 1-3 accounts so the default view is never capped.
const MERGE_CAP = 2000;

function loadVisibleColumns() {
  try {
    const saved = JSON.parse(localStorage.getItem(VISIBLE_COLUMNS_KEY) || 'null');
    return Array.isArray(saved) && saved.length ? saved : DEFAULT_VISIBLE_COLUMNS;
  } catch {
    return DEFAULT_VISIBLE_COLUMNS;
  }
}

function persistVisibleColumns(keys) {
  try { localStorage.setItem(VISIBLE_COLUMNS_KEY, JSON.stringify(keys)); }
  catch { /* ignore */ }
}

// Single-select by default (value/onChange are a plain string, matching the
// existing Industry/Health filters). Pass multiSelect to switch value/onChange
// to an array — options get checkboxes and the dropdown stays open between
// picks so several tiers can be checked in one pass; the "All ___" option
// (value 'all') always clears the selection and closes, in both modes.
function FilterDropdown({ label, value, options, onChange, multiSelect = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const realOptions = options.filter((o) => o.value !== 'all');
  const allOption = options.find((o) => o.value === 'all');

  const isActive = multiSelect ? value.length > 0 : value !== 'all';
  let buttonText = label;
  if (multiSelect) {
    if (value.length === 1) buttonText = `${label}: ${realOptions.find((o) => o.value === value[0])?.label || value[0]}`;
    else if (value.length > 1) buttonText = `${label} (${value.length})`;
  } else if (isActive) {
    buttonText = `${label}: ${realOptions.find((o) => o.value === value)?.label || value}`;
  }

  function toggleValue(optValue) {
    if (!multiSelect) {
      onChange(optValue);
      setOpen(false);
      return;
    }
    const next = value.includes(optValue) ? value.filter((v) => v !== optValue) : [...value, optValue];
    onChange(next);
  }

  function selectAll() {
    onChange(multiSelect ? [] : 'all');
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
          ${isActive
            ? 'bg-rs-teal/10 text-rs-teal border-rs-teal/30'
            : 'text-rs-muted border-rs-border hover:text-rs-text hover:border-rs-text/30'
          }`}
      >
        {buttonText}
        <ChevronDownIcon className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-20 bg-white border border-rs-border rounded-lg shadow-lg py-1 min-w-[140px] max-h-64 overflow-y-auto">
          {allOption && (
            <button
              onClick={selectAll}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-rs-surface transition-colors whitespace-nowrap
                ${!isActive ? 'text-rs-teal font-medium' : 'text-rs-text'}`}
            >
              {allOption.label}
            </button>
          )}
          {realOptions.map((opt) => {
            const checked = multiSelect ? value.includes(opt.value) : opt.value === value;
            return multiSelect ? (
              <label
                key={opt.value}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-rs-surface transition-colors whitespace-nowrap cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleValue(opt.value)}
                  className="rounded border-rs-border text-rs-teal focus:ring-rs-teal/30"
                />
                <span className={checked ? 'text-rs-teal font-medium' : 'text-rs-text'}>{opt.label}</span>
              </label>
            ) : (
              <button
                key={opt.value}
                onClick={() => toggleValue(opt.value)}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-rs-surface transition-colors whitespace-nowrap
                  ${checked ? 'text-rs-teal font-medium' : 'text-rs-text'}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ColumnChooser({ visibleKeys, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const visibleSet = useMemo(() => new Set(visibleKeys), [visibleKeys]);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function toggle(key) {
    const next = visibleSet.has(key)
      ? visibleKeys.filter((k) => k !== key)
      : [...visibleKeys, key];
    onChange(next);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-rs-border text-rs-muted hover:text-rs-text hover:border-rs-text/30 transition-colors"
      >
        <Squares2X2Icon className="h-3.5 w-3.5" />
        Columns ({visibleKeys.length})
        <ChevronDownIcon className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 right-0 z-20 bg-white border border-rs-border rounded-lg shadow-lg py-2 w-64 max-h-96 overflow-y-auto">
          <div className="px-3 pb-1 flex justify-between items-center">
            <button onClick={() => onChange(DEFAULT_VISIBLE_COLUMNS)} className="text-[11px] text-rs-teal hover:underline">Reset to default</button>
            <button onClick={() => onChange(COLUMN_CATALOG.map((c) => c.key))} className="text-[11px] text-rs-teal hover:underline">Select all</button>
          </div>
          {COLUMN_GROUPS.map((group) => (
            <div key={group} className="px-3 pt-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-rs-muted mb-1">{group}</p>
              {COLUMN_CATALOG.filter((c) => c.group === group).map((col) => (
                <label key={col.key} className="flex items-center gap-2 py-1 text-xs text-rs-text cursor-pointer">
                  <input
                    type="checkbox"
                    checked={visibleSet.has(col.key)}
                    onChange={() => toggle(col.key)}
                    className="rounded border-rs-border text-rs-teal focus:ring-rs-teal/30"
                  />
                  {col.label}
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Selecting a *Client* tier (e.g. "Tier 1 Client") auto-applies the exact
// Salesforce report definition of a current client — Account Type equals
// Platform Client/Both Platform and Consulting Client, AND ARR at End of
// Month > $0 — on top of the plain tier match. Selecting a *Prospect* tier
// applies no extra condition. This keeps "current client" accurate without a
// second, confusing filter dropdown.
function matchesTierFilter(account, filterTier) {
  if (filterTier.length === 0) return true;
  if (!filterTier.includes(account.AccountType_Tier__c)) return false;
  if (isClientTier(account.AccountType_Tier__c)) {
    return isCurrentClient({ Type: account.Type, ArrEndOfMonth: account.saasoptics__arr_at_end_of_month__c });
  }
  return true;
}

function compareValues(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

export default function CurrentClientsPage() {
  const { triggerRefresh, selectedRep } = useDashboard();
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  // Tier options are the literal AccountType_Tier__c values ("Tier 1
  // Client", "Tier 1 Prospect", ...), which already encode client-vs-
  // prospect status — no separate Client Status filter needed on top.
  const [filterTier, setFilterTier] = useState([]);
  const [filterIndustry, setFilterIndustry] = useState('all');
  const [filterHealth, setFilterHealth] = useState('all');
  // Days-since-LastActivityDate threshold, or 'all'.
  const [filterLastActivity, setFilterLastActivity] = useState('all');
  const [visibleColumns, setVisibleColumns] = useState(loadVisibleColumns);
  const [sortKey, setSortKey] = useState('Name');
  const [sortDir, setSortDir] = useState('asc');

  const accountsQ = useSalesforceQuery(fetchAllAccounts);
  const clientsQ = useSalesforceQuery(fetchSnowflakeClients);
  const snowflakeDataQ = useSalesforceQuery(fetchCurrentClientsSnowflakeData);
  const openOppsQ = useSalesforceQuery(fetchOpenOpportunities);
  // Best-effort, non-blocking — a Freshdesk/Jira/Astronomer hiccup shouldn't
  // blank out the whole page; mergeCurrentClients already treats missing
  // data as "no match" rather than an error.
  const freshdeskQ = useSalesforceQuery(fetchFreshdeskData);
  const jiraQ = useSalesforceQuery(fetchJiraData);
  const astroQ = useSalesforceQuery(fetchAstronomerData);

  const loading = accountsQ.loading || clientsQ.loading || snowflakeDataQ.loading || openOppsQ.loading;
  const error = accountsQ.error || clientsQ.error || snowflakeDataQ.error || openOppsQ.error;

  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    persistVisibleColumns(visibleColumns);
  }, [visibleColumns]);

  const openOppCounts = useMemo(() => {
    const map = new Map();
    for (const opp of (openOppsQ.data || [])) {
      if (!opp.AccountId) continue;
      map.set(opp.AccountId, (map.get(opp.AccountId) || 0) + 1);
    }
    return map;
  }, [openOppsQ.data]);

  // The expensive step is mergeCurrentClients — it runs Freshdesk/Jira/
  // Astronomer matching per account — so narrow the input *before* merging,
  // not after. Default (no search): only tracked Tier 1-3 Client/Prospect
  // accounts (~1,200 of the org's ~13,000) — excludes the untracked
  // "Tier 4 Prospect" marketing-only bucket and blank-tier noise. With a
  // search: broaden to every account by name match, since the user is
  // looking for one specific account regardless of its tier.
  const candidateAccounts = useMemo(() => {
    if (!accountsQ.data) return [];
    let rows = accountsQ.data;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter((a) => a.Name?.toLowerCase().includes(q));
    } else {
      rows = rows.filter((a) => isTrackedTier(a.AccountType_Tier__c));
    }
    if (selectedRep !== 'all') rows = rows.filter((a) => a.OwnerId === selectedRep);
    rows = rows.filter((a) => matchesTierFilter(a, filterTier));
    if (filterIndustry !== 'all') rows = rows.filter((a) => a.Industry === filterIndustry);
    return rows.length > MERGE_CAP ? rows.slice(0, MERGE_CAP) : rows;
  }, [accountsQ.data, searchQuery, selectedRep, filterTier, filterIndustry]);

  const isMergeCapped = useMemo(() => {
    if (!accountsQ.data) return false;
    let rows = accountsQ.data;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter((a) => a.Name?.toLowerCase().includes(q));
    } else {
      rows = rows.filter((a) => isTrackedTier(a.AccountType_Tier__c));
    }
    return rows.length > MERGE_CAP;
  }, [accountsQ.data, searchQuery]);

  const allRows = useMemo(() => {
    if (!clientsQ.data || !snowflakeDataQ.data) return [];
    return mergeCurrentClients({
      accounts: candidateAccounts,
      snowflakeClients: clientsQ.data,
      snowflakeData: snowflakeDataQ.data,
      openOppCounts,
      freshdeskData: freshdeskQ.data,
      jiraData: jiraQ.data,
      astroData: astroQ.data,
    });
  }, [candidateAccounts, clientsQ.data, snowflakeDataQ.data, openOppCounts, freshdeskQ.data, jiraQ.data, astroQ.data]);

  // Tier/Industry options come from the full tracked-tier universe (not the
  // current search-narrowed candidate set), so the dropdowns stay stable
  // instead of shrinking to whatever's currently matched.
  const trackedAccounts = useMemo(
    () => (accountsQ.data || []).filter((a) => isTrackedTier(a.AccountType_Tier__c)),
    [accountsQ.data]
  );

  const allTiers = useMemo(() => {
    const s = new Set();
    for (const a of trackedAccounts) if (a.AccountType_Tier__c) s.add(a.AccountType_Tier__c);
    return [...s].sort();
  }, [trackedAccounts]);

  const allIndustries = useMemo(() => {
    const s = new Set();
    for (const a of trackedAccounts) if (a.Industry) s.add(a.Industry);
    return [...s].sort();
  }, [trackedAccounts]);

  const filteredSortedRows = useMemo(() => {
    let rows = allRows;
    if (filterHealth !== 'all') rows = rows.filter((r) => r.HealthStatus === filterHealth);
    if (filterLastActivity !== 'all') {
      const cutoff = Date.now() - Number(filterLastActivity) * 86400000;
      rows = rows.filter((r) => r.LastActivityDate && new Date(r.LastActivityDate).getTime() >= cutoff);
    }
    return [...rows].sort((a, b) => {
      const cmp = compareValues(a[sortKey], b[sortKey]);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [allRows, filterHealth, filterLastActivity, sortKey, sortDir]);

  const visibleColumnDefs = useMemo(
    () => COLUMN_CATALOG.filter((c) => visibleColumns.includes(c.key)),
    [visibleColumns]
  );

  const hasFilters = filterTier.length > 0 || filterIndustry !== 'all' || filterHealth !== 'all' || filterLastActivity !== 'all';
  const activeFilterCount = [filterTier.length > 0, filterIndustry !== 'all', filterHealth !== 'all', filterLastActivity !== 'all'].filter(Boolean).length;

  function clearFilters() {
    setFilterTier([]);
    setFilterIndustry('all');
    setFilterHealth('all');
    setFilterLastActivity('all');
  }

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  if (selectedAccountId) {
    return <AccountView accountId={selectedAccountId} onBack={() => setSelectedAccountId(null)} />;
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

  return (
    <div>
      <div className="rounded-card border border-rs-border bg-white p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-rs-text">Accounts</h2>
            <p className="text-[11px] text-rs-muted mt-0.5">
              Search across every Salesforce account, combined with Snowflake/support data — filter to Current Clients or pick any columns you need below
            </p>
          </div>
          <ColumnChooser visibleKeys={visibleColumns} onChange={setVisibleColumns} />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-rs-muted pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search accounts…"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-rs-border bg-white text-xs text-rs-text placeholder:text-rs-muted focus:outline-none focus:ring-2 focus:ring-rs-teal/30 focus:border-rs-teal"
            />
          </div>
          <FilterDropdown
            label="Tier"
            value={filterTier}
            options={[{ value: 'all', label: 'All tiers' }, ...allTiers.map((t) => ({ value: t, label: t }))]}
            onChange={setFilterTier}
            multiSelect
          />
          <FilterDropdown
            label="Industry"
            value={filterIndustry}
            options={[{ value: 'all', label: 'All industries' }, ...allIndustries.map((i) => ({ value: i, label: i }))]}
            onChange={setFilterIndustry}
          />
          <FilterDropdown
            label="Health"
            value={filterHealth}
            options={[
              { value: 'all', label: 'All health' },
              { value: 'GREEN', label: 'Green' },
              { value: 'YELLOW', label: 'Yellow' },
              { value: 'RED', label: 'Red' },
            ]}
            onChange={setFilterHealth}
          />
          <FilterDropdown
            label="Last Activity"
            value={filterLastActivity}
            options={[
              { value: 'all', label: 'Any time' },
              { value: '7', label: 'Last 7 days' },
              { value: '30', label: 'Last 30 days' },
              { value: '90', label: 'Last 90 days' },
            ]}
            onChange={setFilterLastActivity}
          />
          {hasFilters && (
            <button onClick={clearFilters} className="text-xs text-rs-teal hover:underline">
              Clear {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''}
            </button>
          )}
          <span className="text-xs text-rs-muted ml-auto">
            {isMergeCapped
              ? `Showing first ${MERGE_CAP.toLocaleString()} matches`
              : `${filteredSortedRows.length.toLocaleString()} account${filteredSortedRows.length !== 1 ? 's' : ''}`}
          </span>
        </div>
        {isMergeCapped && (
          <p className="text-[11px] text-amber-700 mt-2">
            That search matches more than {MERGE_CAP.toLocaleString()} accounts — narrow it down (or add a filter above) to see the rest.
          </p>
        )}
        {!searchQuery && (
          <p className="text-[11px] text-rs-muted mt-2">
            Showing tracked clients &amp; prospects (Tier 1–3) only — search by name to look up any account, including untracked/marketing-only ones.
          </p>
        )}
      </div>

      <div className="rounded-card border border-rs-border overflow-hidden">
        {filteredSortedRows.length === 0 ? (
          <div className="py-10 text-center text-sm text-rs-muted">No accounts match this filter.</div>
        ) : (
          <DataTable
            columns={visibleColumnDefs}
            rows={filteredSortedRows}
            onRowClick={(row) => setSelectedAccountId(row.Id)}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
          />
        )}
      </div>
    </div>
  );
}
