import { format } from 'date-fns';
import SlidePanel from '../../components/common/SlidePanel';

function RunStateBadge({ state }) {
  if (!state) return <span className="text-rs-muted">—</span>;
  const style = state === 'success' ? 'bg-green-100 text-green-700' : state === 'failed' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600';
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${style}`}>{state}</span>;
}

function lastRunOf(dag) {
  return [...(dag.runs || [])].sort((a, b) => new Date(b.start_date) - new Date(a.start_date))[0];
}

export function BatchListPanel({ dags, onClose, onDagClick }) {
  return (
    <SlidePanel
      open={!!dags}
      onClose={onClose}
      title="Batch Pipelines (Live — Astronomer)"
      subtitle={`${dags?.length || 0} DAG${dags?.length === 1 ? '' : 's'} · best-effort match`}
      width={540}
    >
      <div className="p-4">
        {(!dags || dags.length === 0) ? (
          <p className="text-xs text-rs-muted">No live DAGs matched for this account.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-rs-muted uppercase tracking-wide text-[10px] border-b border-rs-border">
                <th className="text-left py-2 pr-2 font-semibold">DAG</th>
                <th className="text-left py-2 pr-2 font-semibold">Last Run</th>
                <th className="text-left py-2 font-semibold">Next Run</th>
              </tr>
            </thead>
            <tbody>
              {dags.map((d) => {
                const lastRun = lastRunOf(d);
                return (
                  <tr
                    key={d.dag_id}
                    onClick={() => onDagClick(d)}
                    className="border-b border-rs-border/50 hover:bg-rs-surface cursor-pointer transition-colors"
                  >
                    <td className="py-2 pr-2 text-rs-text font-medium max-w-[220px] truncate">{d.dag_id}</td>
                    <td className="py-2 pr-2"><RunStateBadge state={lastRun?.state} /></td>
                    <td className="py-2 text-rs-muted">{d.next_dagrun_run_after ? format(new Date(d.next_dagrun_run_after), 'MMM d, h:mm a') : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </SlidePanel>
  );
}

export function BatchDetailPanel({ dag, onClose, onBack }) {
  const runs = [...(dag?.runs || [])].sort((a, b) => new Date(b.start_date) - new Date(a.start_date));

  return (
    <SlidePanel open={!!dag} onClose={onClose} title={dag?.dag_id || 'DAG'} subtitle="Live status from Astronomer" width={520}>
      {dag && (
        <div className="p-4 space-y-4">
          <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-rs-teal hover:underline">
            ← Back to list
          </button>
          <div className="divide-y divide-rs-border/50 border border-rs-border rounded-lg overflow-hidden text-xs">
            <div className="flex justify-between px-3 py-2">
              <span className="text-rs-muted">Paused</span>
              <span className="text-rs-text font-medium">{dag.is_paused ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex justify-between px-3 py-2">
              <span className="text-rs-muted">Stale</span>
              <span className="text-rs-text font-medium">{dag.is_stale ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex justify-between px-3 py-2">
              <span className="text-rs-muted">Import Errors</span>
              <span className="text-rs-text font-medium">{dag.has_import_errors ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex justify-between px-3 py-2">
              <span className="text-rs-muted">Next Scheduled Run</span>
              <span className="text-rs-text font-medium">{dag.next_dagrun_run_after ? format(new Date(dag.next_dagrun_run_after), 'MMM d, h:mm a') : '—'}</span>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-rs-muted mb-1.5">Recent Runs</p>
            {runs.length === 0 ? (
              <p className="text-xs text-rs-muted">No recent run history.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-rs-muted uppercase tracking-wide text-[10px] border-b border-rs-border">
                    <th className="text-left py-1.5 pr-2 font-semibold">State</th>
                    <th className="text-left py-1.5 pr-2 font-semibold">Start</th>
                    <th className="text-left py-1.5 font-semibold">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.dag_run_id} className="border-b border-rs-border/50">
                      <td className="py-1.5 pr-2"><RunStateBadge state={r.state} /></td>
                      <td className="py-1.5 pr-2 text-rs-muted">{r.start_date ? format(new Date(r.start_date), 'MMM d, h:mm a') : '—'}</td>
                      <td className="py-1.5 text-rs-muted">{r.duration != null ? `${Math.round(r.duration)}s` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </SlidePanel>
  );
}
