import { useState, useEffect, useRef, useMemo } from 'react';
import {
  ChevronDownIcon, PencilIcon, CheckIcon, XMarkIcon, ArrowPathIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { useSalesforceQuery } from '../../hooks/useSalesforceQuery';
import { useDashboard } from '../../context/DashboardContext';
import { fetchAllAccounts } from '../../datasources/salesforce';
import { fetchSnowflakeClients } from '../../datasources/snowflake';
import { findBestMatch, matchConfidence } from '../../lib/accountMatch';
import { resolveClientMappingStatuses } from '../../lib/accountMapping';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorState from '../../components/common/ErrorState';

const MAP_KEY = 'snowflakeAccountMap';

function loadMap() {
  try { return JSON.parse(localStorage.getItem(MAP_KEY) || '{}'); }
  catch { return {}; }
}

function persistMap(map) {
  try { localStorage.setItem(MAP_KEY, JSON.stringify(map)); }
  catch { /* ignore */ }
}

const CONFIDENCE_STYLE = {
  verified: 'bg-green-100 text-green-700',
  high: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-red-100 text-red-600',
  manual: 'bg-rs-teal/10 text-rs-teal',
};

function ConfidenceBadge({ confidence, score }) {
  if (!confidence) return <span className="text-rs-muted text-xs">—</span>;
  const pct = score != null ? ` (${Math.round(score * 100)}%)` : '';
  const label = confidence === 'manual' ? 'Manual' : confidence[0].toUpperCase() + confidence.slice(1);
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${CONFIDENCE_STYLE[confidence] || 'bg-slate-100 text-slate-600'}`}>
      {label}{confidence !== 'verified' ? pct : ''}
    </span>
  );
}

const STATUS_STYLE = {
  verified: 'bg-green-100 text-green-700',
  stale: 'bg-red-100 text-red-600',
  pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
};

const STATUS_LABEL = {
  verified: 'Verified',
  stale: 'Stale ID',
  pending: 'Needs Review',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
};

function StatusBadge({ status }) {
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_STYLE[status] || 'bg-slate-100 text-slate-600'}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
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
        <div className="absolute top-full mt-1 left-0 z-20 bg-white border border-rs-border rounded-lg shadow-lg py-1 min-w-[140px]">
          {options.map((opt) => (
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

function EditPanel({ row, accounts, onSave, onCancel }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts.slice(0, 20);
    return accounts.filter((a) => a.Name.toLowerCase().includes(q)).slice(0, 20);
  }, [search, accounts]);

  return (
    <tr className="bg-rs-surface border-b border-rs-border">
      <td colSpan={6} className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-rs-text">Pick the correct Salesforce account for "{row.clientName}"</span>
        </div>
        <input
          autoFocus
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Salesforce accounts…"
          className="w-full mb-2 px-3 py-1.5 text-sm border border-rs-border rounded-lg focus:outline-none focus:border-rs-teal"
        />
        <div className="max-h-56 overflow-y-auto border border-rs-border rounded-lg bg-white">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-xs text-rs-muted text-center">No matching accounts</div>
          ) : (
            filtered.map((a) => (
              <button
                key={a.Id}
                onClick={() => onSave(a)}
                className="w-full text-left px-3 py-2 text-sm text-rs-text hover:bg-rs-surface border-b border-rs-border/50 last:border-0 transition-colors"
              >
                {a.Name}
              </button>
            ))
          )}
        </div>
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => onSave(null)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-rs-border text-xs text-rs-muted rounded-lg hover:text-rs-text transition-colors"
          >
            No match for this client
          </button>
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-rs-border text-xs text-rs-muted rounded-lg hover:text-rs-text transition-colors"
          >
            <XMarkIcon className="h-3.5 w-3.5" /> Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

function MappingRow({ row, accounts, onAccept, onReject, onSave, editing, onEditStart, onEditCancel }) {
  return (
    <>
      <tr className="border-b border-rs-border hover:bg-rs-surface transition-colors">
        <td className="px-3 py-2 text-sm font-medium text-rs-text whitespace-nowrap">{row.clientName}</td>
        <td className="px-3 py-2 text-xs text-rs-muted whitespace-nowrap">{row.contractTier || '—'}</td>
        <td className="px-3 py-2 text-sm text-rs-text">
          {row.status === 'stale' ? (
            <span className="flex items-center gap-1 text-red-600">
              <ExclamationTriangleIcon className="h-3.5 w-3.5 shrink-0" />
              ID {row.salesforceAccountId} not found in Salesforce
            </span>
          ) : (
            row.mappedAccountName || row.resolvedAccount?.Name || row.suggestion?.account?.Name
              || <span className="text-rs-muted">No confident match</span>
          )}
        </td>
        <td className="px-3 py-2">
          <ConfidenceBadge confidence={row.displayConfidence} score={row.status === 'pending' ? row.suggestion?.score : null} />
        </td>
        <td className="px-3 py-2"><StatusBadge status={row.status} /></td>
        <td className="px-3 py-2 whitespace-nowrap">
          <div className="flex gap-2">
            {row.status === 'pending' && row.suggestion && (
              <button
                onClick={() => onAccept(row)}
                className="flex items-center gap-1 px-2 py-1 bg-rs-teal text-white text-[11px] font-medium rounded hover:bg-rs-teal/90 transition-colors"
              >
                <CheckIcon className="h-3 w-3" /> Accept
              </button>
            )}
            <button
              onClick={() => onEditStart(row.clientId)}
              className="flex items-center gap-1 px-2 py-1 border border-rs-border text-[11px] text-rs-muted rounded hover:text-rs-text transition-colors"
            >
              <PencilIcon className="h-3 w-3" /> Edit
            </button>
            {(row.status === 'pending' || row.status === 'stale') && (
              <button
                onClick={() => onReject(row)}
                className="flex items-center gap-1 px-2 py-1 border border-rs-border text-[11px] text-rs-muted rounded hover:text-red-600 hover:border-red-200 transition-colors"
              >
                Reject
              </button>
            )}
          </div>
        </td>
      </tr>
      {editing && (
        <EditPanel
          row={row}
          accounts={accounts}
          onSave={(account) => onSave(row, account)}
          onCancel={onEditCancel}
        />
      )}
    </>
  );
}

export default function AccountMapping() {
  const { triggerRefresh } = useDashboard();
  const accountsQ = useSalesforceQuery(fetchAllAccounts);
  const clientsQ = useSalesforceQuery(fetchSnowflakeClients);
  const [map, setMap] = useState(loadMap);
  const [statusFilter, setStatusFilter] = useState('all');
  const [confidenceFilter, setConfidenceFilter] = useState('all');
  const [editingClientId, setEditingClientId] = useState(null);

  const loading = accountsQ.loading || clientsQ.loading;
  const error = accountsQ.error || clientsQ.error;

  const rows = useMemo(() => {
    const accounts = accountsQ.data || [];
    const accountsById = new Map(accounts.map((a) => [a.Id, a]));
    const clientsByI = new Map((clientsQ.data || []).map((c) => [c.clientId, c]));

    return resolveClientMappingStatuses({ accounts, snowflakeClients: clientsQ.data, overrideMap: map }).map((r) => {
      const c = clientsByI.get(r.clientId);
      const override = map[r.clientId];
      const resolvedAccount = r.resolvedAccountId ? accountsById.get(r.resolvedAccountId) : null;
      const suggestion = r.status === 'pending' && accounts.length ? findBestMatch(r.clientName, accounts) : null;

      const displayConfidence = r.status === 'confirmed' || r.status === 'rejected'
        ? (override?.confidence || null)
        : r.status === 'verified'
          ? 'verified'
          : r.status === 'pending'
            ? (suggestion ? matchConfidence(suggestion.score) : null)
            : null;

      return {
        clientId: r.clientId,
        clientName: r.clientName,
        contractTier: c?.contractTier,
        salesforceAccountId: c?.salesforceAccountId,
        resolvedAccount,
        suggestion,
        status: r.status,
        displayConfidence,
        mappedAccountId: override?.salesforceAccountId || null,
        mappedAccountName: override?.salesforceAccountName || null,
      };
    });
  }, [clientsQ.data, accountsQ.data, map]);

  const verifiedCount = rows.filter((r) => r.status === 'verified').length;
  const needsReviewCount = rows.filter((r) => r.status === 'pending' || r.status === 'stale').length;
  const confirmedCount = rows.filter((r) => r.status === 'confirmed').length;
  const rejectedCount = rows.filter((r) => r.status === 'rejected').length;

  const filteredRows = rows.filter((r) => {
    if (statusFilter === 'needsReview' && r.status !== 'pending' && r.status !== 'stale') return false;
    if (statusFilter === 'verified' && r.status !== 'verified') return false;
    if (statusFilter === 'confirmed' && r.status !== 'confirmed') return false;
    if (statusFilter === 'rejected' && r.status !== 'rejected') return false;
    if (confidenceFilter !== 'all' && r.displayConfidence !== confidenceFilter) return false;
    return true;
  });

  function updateMap(clientId, entry) {
    const next = { ...map, [clientId]: entry };
    setMap(next);
    persistMap(next);
  }

  function handleAccept(row) {
    if (!row.suggestion) return;
    updateMap(row.clientId, {
      salesforceAccountId: row.suggestion.account.Id,
      salesforceAccountName: row.suggestion.account.Name,
      status: 'confirmed',
      confidence: matchConfidence(row.suggestion.score),
      updatedAt: Date.now(),
    });
  }

  function handleReject(row) {
    updateMap(row.clientId, {
      salesforceAccountId: null,
      salesforceAccountName: null,
      status: 'rejected',
      confidence: row.displayConfidence,
      updatedAt: Date.now(),
    });
  }

  function handleEditSave(row, account) {
    if (!account) {
      updateMap(row.clientId, {
        salesforceAccountId: null,
        salesforceAccountName: null,
        status: 'rejected',
        confidence: 'manual',
        updatedAt: Date.now(),
      });
    } else {
      updateMap(row.clientId, {
        salesforceAccountId: account.Id,
        salesforceAccountName: account.Name,
        status: 'confirmed',
        confidence: 'manual',
        updatedAt: Date.now(),
      });
    }
    setEditingClientId(null);
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
      <div className="rounded-card border border-rs-border bg-white p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-rs-text">Account Mapping</h2>
            <p className="text-[11px] text-rs-muted mt-0.5">
              Snowflake clients (DIM_CLIENT) matched to Salesforce accounts · read-only connection, nothing is ever written back to Snowflake
            </p>
          </div>
          <button
            onClick={triggerRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-rs-border text-xs text-rs-muted rounded-lg hover:text-rs-text transition-colors"
          >
            <ArrowPathIcon className="h-3.5 w-3.5" /> Re-scan
          </button>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 bg-rs-surface border border-rs-border rounded-lg px-3 py-2">
            <span className="text-xs font-semibold text-rs-text">{rows.length}</span>
            <span className="text-xs text-rs-muted">clients</span>
          </div>
          <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
            <span className="text-xs font-semibold text-green-700">{verifiedCount}</span>
            <span className="text-xs text-rs-muted">verified (pre-mapped)</span>
          </div>
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            <span className="text-xs font-semibold text-amber-700">{needsReviewCount}</span>
            <span className="text-xs text-rs-muted">needs review</span>
          </div>
          <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
            <span className="text-xs font-semibold text-green-700">{confirmedCount}</span>
            <span className="text-xs text-rs-muted">confirmed</span>
          </div>
          <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            <span className="text-xs font-semibold text-red-600">{rejectedCount}</span>
            <span className="text-xs text-rs-muted">rejected</span>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        <FilterDropdown
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'needsReview', label: 'Needs Review' },
            { value: 'verified', label: 'Verified' },
            { value: 'confirmed', label: 'Confirmed' },
            { value: 'rejected', label: 'Rejected' },
          ]}
        />
        <FilterDropdown
          label="Confidence"
          value={confidenceFilter}
          onChange={setConfidenceFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'high', label: 'High' },
            { value: 'medium', label: 'Medium' },
            { value: 'low', label: 'Low' },
          ]}
        />
      </div>

      <div className="rounded-card border border-rs-border overflow-hidden overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              {['Snowflake Client', 'Contract Tier', 'Suggested / Mapped Account', 'Confidence', 'Status', 'Actions'].map((h) => (
                <th key={h} className="bg-rs-teal text-white px-3 py-2 text-left text-xs font-semibold tracking-wide whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-rs-muted">No clients match this filter</td></tr>
            ) : (
              filteredRows.map((row) => (
                <MappingRow
                  key={row.clientId}
                  row={row}
                  accounts={accountsQ.data || []}
                  onAccept={handleAccept}
                  onReject={handleReject}
                  onSave={handleEditSave}
                  editing={editingClientId === row.clientId}
                  onEditStart={setEditingClientId}
                  onEditCancel={() => setEditingClientId(null)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
