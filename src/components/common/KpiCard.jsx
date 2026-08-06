export default function KpiCard({
  title, value, subtitle, category, loading = false, onClick,
  goal, goalLabel, goalPct,
}) {
  const showGoal = goal != null && goalPct != null;
  const barColor = goalPct >= 100 ? 'bg-rs-teal' : goalPct >= 75 ? 'bg-amber-400' : 'bg-red-400';
  const pctBadge = goalPct >= 100 ? 'bg-rs-teal/10 text-rs-teal' : goalPct >= 75 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600';

  return (
    <div
      className={`rounded-xl border border-rs-border bg-white overflow-hidden ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      <div className="px-4 pt-3.5 pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide mb-2 text-rs-muted">{title}</p>
        {loading ? (
          <div className="space-y-2">
            <div className="h-7 w-28 animate-pulse rounded bg-rs-surface" />
            {showGoal && <div className="h-2 w-full animate-pulse rounded bg-rs-surface" />}
          </div>
        ) : (
          <>
            {showGoal ? (
              <p className="text-xl font-bold text-rs-text leading-snug">{goalLabel}</p>
            ) : (
              <>
                <p className="text-2xl font-bold text-rs-text">{value ?? '—'}</p>
                {subtitle && <p className="mt-1 text-xs text-rs-muted">{subtitle}</p>}
              </>
            )}
            {showGoal && (
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-rs-surface overflow-hidden">
                  <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${Math.min(goalPct, 100)}%` }} />
                </div>
                <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${pctBadge}`}>
                  {Math.round(goalPct)}%
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
