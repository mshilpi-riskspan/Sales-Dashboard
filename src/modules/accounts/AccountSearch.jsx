import { useState, useEffect, useRef, useMemo } from 'react';
import { MagnifyingGlassIcon, ChevronDownIcon, ExclamationTriangleIcon, ClockIcon } from '@heroicons/react/24/outline';
import { useSalesforceQuery } from '../../hooks/useSalesforceQuery';
import { useDashboard } from '../../context/DashboardContext';
import { fetchAllAccounts, fetchOpenOpportunities } from '../../datasources/salesforce';

const RECENTLY_VIEWED_KEY = 'rs_recently_viewed_accounts';

function getRecentlyViewed() {
  try { return JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) || '[]'); }
  catch { return []; }
}

function saveRecentlyViewed(account) {
  const prev = getRecentlyViewed().filter(a => a.id !== account.Id);
  const next = [{ id: account.Id }, ...prev].slice(0, 10);
  localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next));
}

function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[.,'"]/g, '')
    .replace(/\b(llc|inc|corp|ltd|co|company|group|the)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatARR(v) {
  if (!v) return '—';
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function relativeDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00' : dateStr);
  const diff = Math.floor((Date.now() - d) / 86400000);
  if (diff < 0) return '—';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 30) return `${diff}d ago`;
  if (diff < 365) return `${Math.floor(diff / 30)}mo ago`;
  return `${Math.floor(diff / 365)}yr ago`;
}

const STAGE_ORDER = [
  'Initial Demo / SQL',
  'Technical Fit Agreement',
  'Proposal (Pricing) Delivered',
  'Trial',
  'Negotiation & Decision Making',
  'Contract Sent for Signature',
];

function FilterDropdown({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find(o => o.value === value);

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
        onClick={() => setOpen(o => !o)}
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
        <div className="absolute top-full mt-1 left-0 z-20 bg-white border border-rs-border rounded-lg shadow-lg py-1 min-w-[140px]">
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-rs-surface transition-colors
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

function LoadingSkeleton() {
  return (
    <div className="space-y-2 mt-2">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="animate-pulse flex gap-3 py-2.5 border-b border-rs-border/50">
          <div className="h-4 bg-rs-surface rounded flex-1" />
          <div className="h-4 bg-rs-surface rounded w-16" />
          <div className="h-4 bg-rs-surface rounded w-20" />
          <div className="h-4 bg-rs-surface rounded w-16" />
          <div className="h-4 bg-rs-surface rounded w-12" />
        </div>
      ))}
    </div>
  );
}

function ResultsTable({ rows, focusedIndex, similarNameIds, stageMap, onSelect }) {
  const rowRefs = useRef([]);

  useEffect(() => {
    if (focusedIndex >= 0 && rowRefs.current[focusedIndex]) {
      rowRefs.current[focusedIndex].scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex]);

  if (!rows.length) return null;

  return (
    <div className="border border-rs-border rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-rs-navy text-white">
            <th className="text-left px-3 py-2 font-semibold">Account</th>
            <th className="text-left px-3 py-2 font-semibold">Tier</th>
            <th className="text-left px-3 py-2 font-semibold hidden md:table-cell">Industry</th>
            <th className="text-left px-3 py-2 font-semibold hidden lg:table-cell">Owner</th>
            <th className="text-right px-3 py-2 font-semibold">ARR</th>
            <th className="text-right px-3 py-2 font-semibold hidden sm:table-cell">Opps</th>
            <th className="text-right px-3 py-2 font-semibold hidden lg:table-cell">Last Activity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((account, i) => {
            const isFocused = i === focusedIndex;
            const hasSimilar = similarNameIds.has(account.Id);
            const stages = stageMap ? [...(stageMap.get(account.Id) || [])] : [];
            return (
              <tr
                key={account.Id}
                ref={el => rowRefs.current[i] = el}
                onClick={() => onSelect(account)}
                className={`border-b border-rs-border/50 last:border-0 cursor-pointer transition-colors
                  ${isFocused ? 'bg-rs-teal/5 ring-1 ring-inset ring-rs-teal/20' : 'hover:bg-rs-surface/60'}`}
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-rs-text">{account.Name}</span>
                    {hasSimilar && (
                      <ExclamationTriangleIcon className="h-3 w-3 text-amber-400 shrink-0" title="Multiple accounts share a similar name" />
                    )}
                  </div>
                  {stages.length > 0 && (
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      {stages.slice(0, 2).map(s => (
                        <span key={s} className="inline-flex px-1 py-0 rounded text-[9px] bg-rs-teal/10 text-rs-teal">{s}</span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {account.AccountType_Tier__c ? (
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold
                      ${account.AccountType_Tier__c.includes('1') ? 'bg-rs-teal/10 text-rs-teal' : 'bg-slate-100 text-slate-600'}`}>
                      {account.AccountType_Tier__c}
                    </span>
                  ) : <span className="text-rs-muted">—</span>}
                </td>
                <td className="px-3 py-2.5 text-rs-muted hidden md:table-cell">{account.Industry || '—'}</td>
                <td className="px-3 py-2.5 text-rs-muted hidden lg:table-cell">
                  {account.Owner?.Name || account['Owner.Name'] || '—'}
                </td>
                <td className="px-3 py-2.5 text-right font-medium text-rs-text">
                  {formatARR(account.Current_ARR__c)}
                </td>
                <td className="px-3 py-2.5 text-right text-rs-muted hidden sm:table-cell">
                  {stageMap ? (stageMap.get(account.Id)?.size ?? 0) : '—'}
                </td>
                <td className="px-3 py-2.5 text-right text-rs-muted hidden lg:table-cell">
                  {relativeDate(account.LastActivityDate)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function AccountSearch({ onSelect }) {
  const { selectedRep } = useDashboard();
  const searchRef = useRef(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTier, setFilterTier] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterStage, setFilterStage] = useState('all');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [recentIds] = useState(() => getRecentlyViewed().map(r => r.id));

  const { data: allAccounts, loading, error } = useSalesforceQuery(fetchAllAccounts);
  const { data: openOpps } = useSalesforceQuery(fetchOpenOpportunities);

  // Debounce search query
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Stage map: accountId → Set<stageName>
  const stageMap = useMemo(() => {
    const map = new Map();
    for (const opp of (openOpps || [])) {
      if (!opp.AccountId || !opp.StageName) continue;
      if (!map.has(opp.AccountId)) map.set(opp.AccountId, new Set());
      map.get(opp.AccountId).add(opp.StageName);
    }
    return map;
  }, [openOpps]);

  // Distinct stages from open opps, in funnel order
  const allStages = useMemo(() => {
    const s = new Set();
    for (const opp of (openOpps || [])) if (opp.StageName) s.add(opp.StageName);
    return [...s].sort((a, b) => {
      const ia = STAGE_ORDER.indexOf(a);
      const ib = STAGE_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [openOpps]);

  // Distinct tiers
  const allTiers = useMemo(() => {
    const s = new Set();
    for (const a of (allAccounts || [])) if (a.AccountType_Tier__c) s.add(a.AccountType_Tier__c);
    return [...s].sort();
  }, [allAccounts]);

  // Similar name detection across all accounts
  const similarNameIds = useMemo(() => {
    const nameCount = new Map();
    for (const a of (allAccounts || [])) {
      const norm = normalizeName(a.Name);
      if (norm) nameCount.set(norm, (nameCount.get(norm) || 0) + 1);
    }
    const ids = new Set();
    for (const a of (allAccounts || [])) {
      if (nameCount.get(normalizeName(a.Name)) > 1) ids.add(a.Id);
    }
    return ids;
  }, [allAccounts]);

  // Recently viewed accounts (fresh data from allAccounts)
  const recentRows = useMemo(() => {
    if (!allAccounts) return [];
    const map = new Map(allAccounts.map(a => [a.Id, a]));
    return recentIds.map(id => map.get(id)).filter(Boolean);
  }, [allAccounts, recentIds]);

  // Filtered + sorted results
  const results = useMemo(() => {
    let accounts = allAccounts || [];

    if (selectedRep !== 'all') {
      accounts = accounts.filter(a => a.OwnerId === selectedRep);
    }
    if (filterTier !== 'all') {
      accounts = accounts.filter(a => a.AccountType_Tier__c === filterTier);
    }
    if (filterStatus !== 'all') {
      accounts = accounts.filter(a => {
        const isClient = a.AccountType_Tier__c?.toLowerCase().includes('client');
        return filterStatus === 'Client' ? isClient : !isClient;
      });
    }
    if (filterStage !== 'all') {
      accounts = accounts.filter(a => stageMap.get(a.Id)?.has(filterStage));
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      accounts = accounts.filter(a => a.Name?.toLowerCase().includes(q));
      accounts.sort((a, b) => {
        const an = (a.Name || '').toLowerCase();
        const bn = (b.Name || '').toLowerCase();
        const ap = an.startsWith(q), bp = bn.startsWith(q);
        if (ap && !bp) return -1;
        if (!ap && bp) return 1;
        return (b.Current_ARR__c || 0) - (a.Current_ARR__c || 0);
      });
    }
    return accounts;
  }, [allAccounts, selectedRep, filterTier, filterStatus, filterStage, searchQuery, stageMap]);

  const hasFilters = filterTier !== 'all' || filterStatus !== 'all' || filterStage !== 'all';
  const activeFilterCount = [filterTier !== 'all', filterStatus !== 'all', filterStage !== 'all'].filter(Boolean).length;
  const isEmptySearch = !searchQuery && !hasFilters;

  function handleSelect(account) {
    saveRecentlyViewed(account);
    onSelect(account.Id);
  }

  function handleKeyDown(e) {
    const len = isEmptySearch ? recentRows.length : results.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(i => Math.min(i + 1, len - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && focusedIndex >= 0) {
      e.preventDefault();
      const row = isEmptySearch ? recentRows[focusedIndex] : results[focusedIndex];
      if (row) handleSelect(row);
    }
  }

  // '/' focuses search when not already in an input
  useEffect(() => {
    function onKey(e) {
      if (e.key === '/' && document.activeElement !== searchRef.current &&
          !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function clearFilters() {
    setFilterTier('all');
    setFilterStatus('all');
    setFilterStage('all');
    setFocusedIndex(-1);
  }

  return (
    <div className="flex flex-col" style={{ minHeight: 0 }}>
      {/* Search bar */}
      <div className="pb-3">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-rs-muted pointer-events-none" />
          <input
            ref={searchRef}
            autoFocus
            type="text"
            value={searchInput}
            onChange={e => { setSearchInput(e.target.value); setFocusedIndex(-1); }}
            onKeyDown={handleKeyDown}
            placeholder="Search accounts…"
            className="w-full pl-9 pr-16 py-2.5 rounded-lg border border-rs-border bg-white text-sm text-rs-text placeholder:text-rs-muted focus:outline-none focus:ring-2 focus:ring-rs-teal/30 focus:border-rs-teal"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <kbd className="text-[10px] text-rs-muted border border-rs-border rounded px-1 py-0.5">/</kbd>
            <kbd className="text-[10px] text-rs-muted border border-rs-border rounded px-1 py-0.5">⌘K</kbd>
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          <FilterDropdown
            label="Tier"
            value={filterTier}
            options={[{ value: 'all', label: 'All tiers' }, ...allTiers.map(t => ({ value: t, label: t }))]}
            onChange={v => { setFilterTier(v); setFocusedIndex(-1); }}
          />
          <FilterDropdown
            label="Status"
            value={filterStatus}
            options={[
              { value: 'all', label: 'All statuses' },
              { value: 'Client', label: 'Client' },
              { value: 'Prospect', label: 'Prospect' },
            ]}
            onChange={v => { setFilterStatus(v); setFocusedIndex(-1); }}
          />
          <FilterDropdown
            label="Stage"
            value={filterStage}
            options={[{ value: 'all', label: 'All stages' }, ...allStages.map(s => ({ value: s, label: s }))]}
            onChange={v => { setFilterStage(v); setFocusedIndex(-1); }}
          />
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="text-xs text-rs-teal hover:underline ml-1">
              Clear {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>

      {/* Results area */}
      <div className="flex-1">
        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <div className="text-sm text-red-500 py-4">{error}</div>
        ) : isEmptySearch ? (
          recentRows.length > 0 ? (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <ClockIcon className="h-3.5 w-3.5 text-rs-muted" />
                <span className="text-xs text-rs-muted">Recently viewed</span>
              </div>
              <ResultsTable
                rows={recentRows}
                focusedIndex={focusedIndex}
                similarNameIds={similarNameIds}
                stageMap={stageMap}
                onSelect={handleSelect}
              />
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-sm text-rs-muted">Search for an account by name, or use the filters above.</p>
              <p className="text-xs text-rs-muted mt-1">Press <kbd className="border border-rs-border rounded px-1">/</kbd> to focus search from anywhere.</p>
            </div>
          )
        ) : results.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-rs-muted">No accounts found{searchQuery ? ` matching "${searchQuery}"` : ''}.</p>
          </div>
        ) : (
          <div>
            <p className="text-xs text-rs-muted mb-2">{results.length.toLocaleString()} account{results.length !== 1 ? 's' : ''}</p>
            <ResultsTable
              rows={results}
              focusedIndex={focusedIndex}
              similarNameIds={similarNameIds}
              stageMap={stageMap}
              onSelect={handleSelect}
            />
          </div>
        )}
      </div>
    </div>
  );
}
