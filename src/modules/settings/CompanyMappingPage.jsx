import { useState, useEffect, useRef, useMemo } from 'react';
import {
  PencilIcon, CheckIcon, XMarkIcon, ArrowPathIcon, MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { fetchAllAccounts } from '../../datasources/salesforce';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorState from '../../components/common/ErrorState';

async function fetchCompanyMap() {
  const res = await fetch('/api/snowflake/mapping');
  if (!res.ok) throw new Error(`Failed to load company map: ${res.status}`);
  return res.json();
}

async function patchCompanyMap(id, field, value) {
  const res = await fetch('/api/snowflake/mapping', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, field, value: value === '' ? null : value }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || `Update failed (${res.status})`);
  }
}

function NullBadge() {
  return <span className="inline-block px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-600 text-[10px] rounded">—</span>;
}

function SfDropdown({ value, display, accounts, onSave, onCancel }) {
  const [search, setSearch] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts.slice(0, 30);
    return accounts.filter((a) => a.Name.toLowerCase().includes(q)).slice(0, 30);
  }, [search, accounts]);

  return (
    <div className="space-y-2">
      {display && (
        <div className="text-[11px] text-rs-muted">
          Current: <span className="text-rs-text font-medium">{display}</span>
        </div>
      )}
      <input
        ref={inputRef}
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search Salesforce accounts…"
        className="w-full px-3 py-1.5 text-sm border border-rs-border rounded-lg focus:outline-none focus:border-rs-teal"
      />
      <div className="max-h-44 overflow-y-auto border border-rs-border rounded-lg bg-white">
        {filtered.length === 0 ? (
          <div className="px-3 py-3 text-xs text-rs-muted text-center">No matching accounts</div>
        ) : (
          filtered.map((a) => (
            <button
              key={a.Id}
              onClick={() => onSave(a.Id, a.Name)}
              className="w-full text-left px-3 py-2 text-sm text-rs-text hover:bg-rs-surface border-b border-rs-border/50 last:border-0 transition-colors"
            >
              {a.Name}
            </button>
          ))
        )}
      </div>
      <button
        onClick={() => onSave(null, null)}
        className="text-[11px] text-rs-muted hover:text-rs-text transition-colors"
      >
        Clear (set to none)
      </button>
    </div>
  );
}

function TextFieldEdit({ label, fieldName, initialValue, onSave, onCancel, numeric }) {
  const [val, setVal] = useState(initialValue ?? '');
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleSave() {
    const trimmed = val.trim();
    if (numeric && trimmed !== '' && isNaN(Number(trimmed))) return;
    onSave(fieldName, trimmed === '' ? null : trimmed);
  }

  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-medium text-rs-text">{label}</div>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type={numeric ? 'number' : 'text'}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onCancel(); }}
          placeholder={`Enter ${label}…`}
          className="flex-1 px-2.5 py-1.5 text-sm border border-rs-border rounded-lg focus:outline-none focus:border-rs-teal"
        />
        <button
          onClick={handleSave}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-rs-teal text-white text-xs rounded-lg hover:bg-rs-teal/90 transition-colors"
        >
          <CheckIcon className="h-3.5 w-3.5" /> Save
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-1 px-2.5 py-1.5 border border-rs-border text-xs text-rs-muted rounded-lg hover:text-rs-text transition-colors"
        >
          <XMarkIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function EditPanel({ row, sfAccounts, onSave, onCancel, saving, error }) {
  const [activeField, setActiveField] = useState(null);

  const fields = [
    { key: 'SF_ACCOUNT_ID',          label: 'Salesforce',  display: row.SF_ACCOUNT_NAME,    value: row.SF_ACCOUNT_ID,          type: 'sf'     },
    { key: 'FD_COMPANY_ID',          label: 'Freshdesk',   display: row.FD_COMPANY_NAME,    value: row.FD_COMPANY_ID,          type: 'number' },
    { key: 'MAXIO_CUSTOMER_ID',      label: 'Maxio',       display: row.MAXIO_CUSTOMER_NAME, value: row.MAXIO_CUSTOMER_ID,     type: 'number' },
    { key: 'ASTRONOMER_TAG',         label: 'Astronomer',  value: row.ASTRONOMER_TAG,        type: 'text'   },
    { key: 'JIRA_LABEL',             label: 'Jira',        value: row.JIRA_LABEL,            type: 'text'   },
    { key: 'SNOWFLAKE_CLIENT_IDENTIFIER', label: 'Snowflake', value: row.SNOWFLAKE_CLIENT_IDENTIFIER, type: 'text' },
  ];

  return (
    <tr className="bg-rs-surface border-b border-rs-border">
      <td colSpan={8} className="px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-rs-text">Edit mappings for "{row.NAME}"</span>
          <button onClick={onCancel} className="text-rs-muted hover:text-rs-text">
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
        {error && (
          <div className="mb-3 px-3 py-2 bg-red-50 border border-red-100 text-xs text-red-600 rounded-lg">{error}</div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {fields.map((f) => (
            <div key={f.key} className="border border-rs-border rounded-lg p-3 bg-white">
              {activeField === f.key ? (
                f.type === 'sf' ? (
                  <div>
                    <div className="text-[11px] font-medium text-rs-text mb-2">{f.label}</div>
                    <SfDropdown
                      value={f.value}
                      display={f.display}
                      accounts={sfAccounts}
                      onSave={(id, name) => { onSave(f.key, id, name); setActiveField(null); }}
                      onCancel={() => setActiveField(null)}
                    />
                  </div>
                ) : (
                  <TextFieldEdit
                    label={f.label}
                    fieldName={f.key}
                    initialValue={f.value}
                    numeric={f.type === 'number'}
                    onSave={(key, val) => { onSave(key, val, null); setActiveField(null); }}
                    onCancel={() => setActiveField(null)}
                  />
                )
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[10px] font-medium text-rs-muted uppercase tracking-wide">{f.label}</div>
                    <div className="text-xs text-rs-text mt-0.5 truncate">
                      {f.value != null
                        ? (f.display ? `${f.display} (${f.value})` : String(f.value))
                        : <span className="text-amber-500 italic">not set</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveField(f.key)}
                    disabled={saving}
                    className="shrink-0 p-1 text-rs-muted hover:text-rs-teal transition-colors disabled:opacity-40"
                  >
                    <PencilIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </td>
    </tr>
  );
}

function MappingRow({ row, sfAccounts, editingId, onEditStart, onEditCancel, onSave, saving, saveError }) {
  const sourceValues = [row.SF_ACCOUNT_ID, row.FD_COMPANY_ID, row.MAXIO_CUSTOMER_ID, row.ASTRONOMER_TAG, row.JIRA_LABEL, row.SNOWFLAKE_CLIENT_IDENTIFIER];
  const missingCount = sourceValues.filter((v) => v == null).length;

  return (
    <>
      <tr className="border-b border-rs-border hover:bg-rs-surface transition-colors">
        {/* Company name */}
        <td className="px-3 py-2 text-sm font-medium text-rs-text whitespace-nowrap max-w-[180px] truncate" title={row.NAME}>
          {row.NAME || <span className="text-rs-muted italic">Unnamed</span>}
        </td>
        {/* Salesforce */}
        <td className="px-3 py-2 text-xs text-rs-text whitespace-nowrap max-w-[140px] truncate" title={row.SF_ACCOUNT_NAME}>
          {row.SF_ACCOUNT_NAME ?? (row.SF_ACCOUNT_ID ? <span className="font-mono text-rs-muted">{row.SF_ACCOUNT_ID}</span> : <NullBadge />)}
        </td>
        {/* Maxio */}
        <td className="px-3 py-2 text-xs text-rs-muted whitespace-nowrap">
          {row.MAXIO_CUSTOMER_ID != null
            ? (row.MAXIO_CUSTOMER_NAME ? row.MAXIO_CUSTOMER_NAME : <span className="font-mono">#{row.MAXIO_CUSTOMER_ID}</span>)
            : <NullBadge />}
        </td>
        {/* Astronomer */}
        <td className="px-3 py-2 text-xs text-rs-muted font-mono whitespace-nowrap max-w-[120px] truncate" title={row.ASTRONOMER_TAG}>
          {row.ASTRONOMER_TAG ?? <NullBadge />}
        </td>
        {/* Jira */}
        <td className="px-3 py-2 text-xs text-rs-muted font-mono whitespace-nowrap max-w-[120px] truncate" title={row.JIRA_LABEL}>
          {row.JIRA_LABEL ?? <NullBadge />}
        </td>
        {/* Freshdesk */}
        <td className="px-3 py-2 text-xs text-rs-muted whitespace-nowrap">
          {row.FD_COMPANY_ID != null
            ? (row.FD_COMPANY_NAME ? row.FD_COMPANY_NAME : <span className="font-mono">#{row.FD_COMPANY_ID}</span>)
            : <NullBadge />}
        </td>
        {/* Snowflake */}
        <td className="px-3 py-2 text-xs text-rs-muted font-mono whitespace-nowrap max-w-[130px] truncate" title={row.SNOWFLAKE_CLIENT_IDENTIFIER}>
          {row.SNOWFLAKE_CLIENT_IDENTIFIER ?? <NullBadge />}
        </td>
        {/* Actions */}
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            {missingCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-600 rounded-full font-medium">
                {missingCount} gap{missingCount > 1 ? 's' : ''}
              </span>
            )}
            <button
              onClick={() => onEditStart(row.ID)}
              className="flex items-center gap-1 px-2 py-1 border border-rs-border text-[11px] text-rs-muted rounded hover:text-rs-text transition-colors"
            >
              <PencilIcon className="h-3 w-3" /> Edit
            </button>
          </div>
        </td>
      </tr>
      {editingId === row.ID && (
        <EditPanel
          row={row}
          sfAccounts={sfAccounts}
          onSave={onSave}
          onCancel={onEditCancel}
          saving={saving}
          error={saveError}
        />
      )}
    </>
  );
}

export default function CompanyMappingPage() {
  const [rows, setRows] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [sfAccounts, setSfAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterGaps, setFilterGaps] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([fetchCompanyMap(), fetchAllAccounts()])
      .then(([map, accounts]) => {
        setRows(map);
        setSfAccounts(accounts || []);
        setLoading(false);
      })
      .catch((err) => {
        setLoadError(err.message);
        setLoading(false);
      });
  }, []);

  async function handleSave(field, value) {
    setSaving(true);
    setSaveError(null);
    try {
      await patchCompanyMap(editingId, field, value);
      setRows((prev) => prev.map((r) => {
        if (r.ID !== editingId) return r;
        const updated = { ...r, [field]: value };
        if (field === 'SF_ACCOUNT_ID') {
          const sfAcc = sfAccounts.find((a) => a.Id === value);
          updated.SF_ACCOUNT_NAME = sfAcc ? sfAcc.Name : null;
        }
        return updated;
      }));
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    let r = rows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter((row) =>
        (row.NAME || '').toLowerCase().includes(q) ||
        (row.SF_ACCOUNT_NAME || '').toLowerCase().includes(q)
      );
    }
    if (filterGaps) {
      r = r.filter((row) =>
        !row.SF_ACCOUNT_ID || !row.FD_COMPANY_ID || !row.MAXIO_CUSTOMER_ID ||
        !row.ASTRONOMER_TAG || !row.JIRA_LABEL || !row.SNOWFLAKE_CLIENT_IDENTIFIER
      );
    }
    return r;
  }, [rows, search, filterGaps]);

  const gapCount = useMemo(() => (rows || []).filter((r) => !r.SF_ACCOUNT_ID).length, [rows]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (loadError) {
    return <ErrorState message={loadError} onRetry={() => window.location.reload()} />;
  }

  const HEADERS = ['Company', 'Salesforce', 'Maxio', 'Astronomer', 'Jira', 'Freshdesk', 'Snowflake', 'Actions'];

  return (
    <div>
      <div className="rounded-card border border-rs-border bg-white p-4 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-rs-text">Company Mapping</h2>
            <p className="text-[11px] text-rs-muted mt-0.5">
              Cross-source company registry — link each source ID to a single internal record
            </p>
          </div>
          <button
            onClick={() => {
              setRows(null);
              setLoading(true);
              fetchCompanyMap().then(setRows).finally(() => setLoading(false));
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-rs-border text-xs text-rs-muted rounded-lg hover:text-rs-text transition-colors"
          >
            <ArrowPathIcon className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 bg-rs-surface border border-rs-border rounded-lg px-3 py-2">
            <span className="text-xs font-semibold text-rs-text">{rows?.length ?? 0}</span>
            <span className="text-xs text-rs-muted">companies</span>
          </div>
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            <span className="text-xs font-semibold text-amber-700">{gapCount}</span>
            <span className="text-xs text-rs-muted">missing SF link</span>
          </div>
          <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
            <span className="text-xs font-semibold text-green-700">{(rows?.length ?? 0) - gapCount}</span>
            <span className="text-xs text-rs-muted">linked</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-xs">
          <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-rs-muted pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search companies…"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-rs-border rounded-lg focus:outline-none focus:border-rs-teal"
          />
        </div>
        <button
          onClick={() => setFilterGaps((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors
            ${filterGaps
              ? 'bg-amber-50 border-amber-200 text-amber-700'
              : 'border-rs-border text-rs-muted hover:text-rs-text'}`}
        >
          {filterGaps ? 'Show All' : 'Show Gaps Only'}
        </button>
      </div>

      {rows?.length === 0 ? (
        <div className="rounded-card border border-rs-border bg-white p-8 text-center">
          <p className="text-sm text-rs-muted">No company data yet. The ETL worker will populate this table on its next run.</p>
        </div>
      ) : (
        <div className="rounded-card border border-rs-border overflow-hidden overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                {HEADERS.map((h) => (
                  <th key={h} className="bg-rs-teal text-white px-3 py-2 text-left text-xs font-semibold tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={HEADERS.length} className="px-4 py-8 text-center text-xs text-rs-muted">
                    No companies match this filter
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <MappingRow
                    key={row.ID}
                    row={row}
                    sfAccounts={sfAccounts}
                    editingId={editingId}
                    onEditStart={(id) => { setEditingId(id); setSaveError(null); }}
                    onEditCancel={() => setEditingId(null)}
                    onSave={handleSave}
                    saving={saving}
                    saveError={saveError}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
