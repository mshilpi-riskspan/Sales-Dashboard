import { format } from 'date-fns';

function formatARR(v) {
  if (!v && v !== 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

function RiskBadge({ score }) {
  if (score >= 5) return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">High</span>;
  if (score >= 3) return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Medium</span>;
  return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">Low</span>;
}

export default function AtRiskClients({ rows }) {
  return (
    <div className="rounded-card border border-rs-border bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-rs-border">
        <h3 className="text-sm font-semibold text-rs-text">At-Risk Clients</h3>
        <p className="text-[10px] text-rs-muted mt-0.5">Manual renewals approaching or cancellations on record</p>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-rs-muted">No at-risk clients identified</div>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              {['Account', 'ARR', 'Next Renewal', 'Days', 'Auto-Renew', 'Cancellations', 'Risk'].map(h => (
                <th key={h} className="bg-rs-teal text-white px-3 py-2 text-left text-xs font-semibold tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.accountName}-${i}`} className="border-b border-rs-border hover:bg-rs-surface transition-colors">
                <td className="px-3 py-2 font-medium text-rs-text">{row.accountName}</td>
                <td className="px-3 py-2 font-semibold text-rs-text">{formatARR(row.arr)}</td>
                <td className="px-3 py-2 text-rs-muted whitespace-nowrap">
                  {row.nextRenewalDate ? format(new Date(row.nextRenewalDate + 'T00:00:00'), 'MMM d, yyyy') : '—'}
                </td>
                <td className="px-3 py-2">
                  {row.daysToRenewal != null ? (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      row.daysToRenewal <= 30 ? 'bg-red-100 text-red-700' :
                      row.daysToRenewal <= 60 ? 'bg-amber-100 text-amber-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {row.daysToRenewal}d
                    </span>
                  ) : '—'}
                </td>
                <td className="px-3 py-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    row.isAutoRenew ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
                  }`}>
                    {row.isAutoRenew ? 'Auto' : 'Manual'}
                  </span>
                </td>
                <td className="px-3 py-2 text-rs-muted text-center">
                  {row.cancelledCount > 0 ? (
                    <span className="text-xs font-semibold text-red-600">{row.cancelledCount}</span>
                  ) : (
                    <span className="text-xs text-rs-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <RiskBadge score={row.score} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
