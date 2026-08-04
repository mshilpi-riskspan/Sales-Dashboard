import { useState, useEffect, useRef, useMemo } from 'react';
import { MagnifyingGlassIcon, ChevronDownIcon, Squares2X2Icon } from '@heroicons/react/24/outline';
import { useSalesforceQuery } from '../../hooks/useSalesforceQuery';
import { useDashboard } from '../../context/DashboardContext';
import { fetchAllAccounts, fetchOpenOpportunities } from '../../datasources/salesforce';
import { fetchSnowflakeClients, fetchCurrentClientsSnowflakeData } from '../../datasources/snowflake';
import { mergeCurrentClients } from '../../lib/currentClientsMerge';
import { COLUMN_CATALOG, COLUMN_GROUPS, DEFAULT_VISIBLE_COLUMNS } from './columnCatalog';
import DataTable from '../../components/common/DataTable';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorState from '../../components/common/ErrorState';
import AccountView from '../accounts/AccountView';

const VISIBLE_COLUMNS_KEY = 'currentClientsVisibleColumns';

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

function FilterDropdown({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find((o) => o.value === value);

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
        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
          ${value !== 'all'
            ? 'bg-rs-teal/10 text-rs-teal border-rs-teal/30'
            : 'text-rs-muted border-rs-border hover:text-rs-text hover:border-rs-text/30'
          }`}
      >
        {label}{value !== 'all' ? `: ${selected?.label || value}` : ''}
        <ChevronDownIcon className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-20 bg-white border border-rs-border rounded-lg shadow-lg py-1 min-w-[140px] max-h-64 overflow-y-auto">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-rs-surface transition-colors whitespace-nowrap
                ${opt.value === value ? 'text-rs-teal font-medium' : 'text-rs-text'}`}
            >
              {opt.label}
            </button>
          ))}
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
  const [filterTier, setFilterTier] = useState('all');
  const [filterIndustry, setFilterIndustry] = useState('all');
  const [filterHealth, setFilterHealth] = useState('all');
  const [visibleColumns, setVisibleColumns] = useState(loadVisibleColumns);
  const [sortKey, setSortKey] = useState('Name');
  const [sortDir, setSortDir] = useState('asc');

  const accountsQ = useSalesforceQuery(fetchAllAccounts);
  const clientsQ = useSalesforceQuery(fetchSnowflakeClients);
  const snowflakeDataQ = useSalesforceQuery(fetchCurrentClientsSnowflakeData);
  const openOppsQ = useSalesforceQuery(fetchOpenOpportunities);

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

  const allRows = useMemo(() => {
    if (!accountsQ.data || !clientsQ.data || !snowflakeDataQ.data) return [];
    return mergeCurrentClients({
      accounts: accountsQ.data,
      snowflakeClients: clientsQ.data,
      snowflakeData: snowflakeDataQ.data,
      openOppCounts,
    });
  }, [accountsQ.data, clientsQ.data, snowflakeDataQ.data, openOppCounts]);

  const allTiers = useMemo(() => {
    const s = new Set();
    for (const r of allRows) if (r.AccountType_Tier__c) s.add(r.AccountType_Tier__c);
    return [...s].sort();
  }, [allRows]);

  const allIndustries = useMemo(() => {
    const s = new Set();
    for (const r of allRows) if (r.Industry) s.add(r.Industry);
    return [...s].sort();
  }, [allRows]);

  const filteredSortedRows = useMemo(() => {
    let rows = allRows;
    if (selectedRep !== 'all') rows = rows.filter((r) => r.OwnerId === selectedRep);
    if (filterTier !== 'all') rows = rows.filter((r) => r.AccountType_Tier__c === filterTier);
    if (filterIndustry !== 'all') rows = rows.filter((r) => r.Industry === filterIndustry);
    if (filterHealth !== 'all') rows = rows.filter((r) => r.HealthStatus === filterHealth);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter((r) => r.Name?.toLowerCase().includes(q));
    }
    return [...rows].sort((a, b) => {
      const cmp = compareValues(a[sortKey], b[sortKey]);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [allRows, selectedRep, filterTier, filterIndustry, filterHealth, searchQuery, sortKey, sortDir]);

  const visibleColumnDefs = useMemo(
    () => COLUMN_CATALOG.filter((c) => visibleColumns.includes(c.key)),
    [visibleColumns]
  );

  const hasFilters = filterTier !== 'all' || filterIndustry !== 'all' || filterHealth !== 'all';
  const activeFilterCount = [filterTier !== 'all', filterIndustry !== 'all', filterHealth !== 'all'].filter(Boolean).length;

  function clearFilters() {
    setFilterTier('all');
    setFilterIndustry('all');
    setFilterHealth('all');
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
            <h2 className="text-sm font-semibold text-rs-text">Current Clients</h2>
            <p className="text-[11px] text-rs-muted mt-0.5">
              One row per client, combining Salesforce and Snowflake — pick any columns you need below
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
              placeholder="Search clients…"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-rs-border bg-white text-xs text-rs-text placeholder:text-rs-muted focus:outline-none focus:ring-2 focus:ring-rs-teal/30 focus:border-rs-teal"
            />
          </div>
          <FilterDropdown
            label="Tier"
            value={filterTier}
            options={[{ value: 'all', label: 'All tiers' }, ...allTiers.map((t) => ({ value: t, label: t }))]}
            onChange={setFilterTier}
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
          {hasFilters && (
            <button onClick={clearFilters} className="text-xs text-rs-teal hover:underline">
              Clear {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''}
            </button>
          )}
          <span className="text-xs text-rs-muted ml-auto">{filteredSortedRows.length.toLocaleString()} client{filteredSortedRows.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <div className="rounded-card border border-rs-border overflow-hidden">
        {filteredSortedRows.length === 0 ? (
          <div className="py-10 text-center text-sm text-rs-muted">No clients match this filter.</div>
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
