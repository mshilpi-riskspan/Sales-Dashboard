import SlidePanel from '../../components/common/SlidePanel';

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function fmtDuration(secs) {
  if (secs == null) return '—';
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function stateColor(state) {
  if (state === 'success') return 'bg-green-400';
  if (state === 'failed')  return 'bg-red-400';
  return 'bg-slate-300';
}

function stateBadge(state) {
  if (state === 'success') return 'bg-green-100 text-green-700';
  if (state === 'failed')  return 'bg-red-100 text-red-600';
  return 'bg-slate-100 text-slate-600';
}

function RunStrip({ runs }) {
  const display = runs.slice(0, 30);
  return (
    <div className="flex gap-0.5 flex-wrap mt-2">
      {display.map((r, i) => (
        <div
          key={r.dag_run_id ?? i}
          title={`${(r.start_date || '').slice(0, 19).replace('T', ' ')} · ${r.state} · ${fmtDuration(r.duration)}`}
          className={`w-3 h-3 rounded-sm cursor-default ${stateColor(r.state)}`}
        />
      ))}
      {runs.length === 0 && <span className="text-xs text-rs-muted">No runs</span>}
    </div>
  );
}

function healthPct(runs) {
  const s = runs.filter(r => r.state === 'success').length;
  const f = runs.filter(r => r.state === 'failed').length;
  const total = s + f;
  return total > 0 ? Math.round((s / total) * 100) : null;
}

export default function OpsClientDetail({ row, onClose }) {
  const open = !!row;
  const hp = row ? healthPct(row.dags?.flatMap(d => d.runs) ?? []) : null;

  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title={row?.accountName ?? '—'}
      subtitle={`${row?.tier ?? ''} · ${row?.dagCount ?? 0} DAG${row?.dagCount !== 1 ? 's' : ''} · ${hp != null ? hp + '% 30-day health' : 'no runs'}`}
      width={520}
    >
      {row && (
        <div className="p-5 space-y-4">
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Last Run', value: fmtDate(row.lastRunDate) },
              { label: 'Today S / F', value: `${row.todaySuccess} / ${row.todayFailed}` },
              { label: '7-day Health', value: row.healthPct7d != null ? `${row.healthPct7d}%` : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-rs-border bg-rs-surface px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-rs-muted mb-0.5">{label}</p>
                <p className="text-sm font-semibold text-rs-text">{value}</p>
              </div>
            ))}
          </div>

          {/* Per-DAG cards */}
          <div className="space-y-3">
            {(row.dags ?? []).map((dag) => {
              const lastRun = dag.runs[0] ?? null;
              const hp30 = healthPct(dag.runs);
              return (
                <div key={dag.dag_id} className="rounded-xl border border-rs-border bg-white overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-rs-surface border-b border-rs-border">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-semibold text-rs-text truncate">{dag.dag_id}</span>
                      {dag.is_paused && (
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Paused</span>
                      )}
                      {dag.has_import_errors && (
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide bg-red-100 text-red-600 px-1.5 py-0.5 rounded">Import Error</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {lastRun && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize ${stateBadge(lastRun.state)}`}>
                          {lastRun.state}
                        </span>
                      )}
                      {hp30 != null && (
                        <span className="text-[10px] text-rs-muted">{hp30}%</span>
                      )}
                    </div>
                  </div>
                  <div className="px-4 py-3">
                    <RunStrip runs={dag.runs} />
                    <div className="flex items-center gap-4 mt-2 text-[10px] text-rs-muted">
                      <span>{dag.runs.length} runs shown</span>
                      {lastRun?.start_date && <span>Last: {(lastRun.start_date || '').slice(0, 10)}</span>}
                      {lastRun?.duration != null && <span>{fmtDuration(lastRun.duration)}</span>}
                      {lastRun?.triggered_by && <span>via {lastRun.triggered_by}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </SlidePanel>
  );
}
