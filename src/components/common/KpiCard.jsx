const COLOR_SCHEMES = {
  activity: { header: '#FFA91D', headerText: '#7c2d12' },
  pipeline: { header: '#0C8EA3', headerText: '#ffffff' },
  dealProgression: { header: '#16A34A', headerText: '#ffffff' },
  revenue: { header: '#7C3AED', headerText: '#ffffff' },
};

function goalBarColor(pct) {
  if (pct >= 100) return 'bg-green-500';
  if (pct >= 75)  return 'bg-amber-400';
  return 'bg-red-400';
}

function goalTextColor(pct) {
  if (pct >= 100) return 'text-green-600';
  if (pct >= 75)  return 'text-amber-600';
  return 'text-red-500';
}

export default function KpiCard({
  title, value, subtitle, category = 'pipeline', loading = false, onClick,
  goal, goalLabel, goalPct,
}) {
  const scheme = COLOR_SCHEMES[category] || COLOR_SCHEMES.pipeline;
  const showGoal = goal != null && goalPct != null;

  return (
    <div
      className={`rounded-card border border-rs-border bg-white overflow-hidden ${onClick ? 'cursor-pointer hover:ring-2 hover:ring-rs-teal/40 transition-shadow' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      <div
        className="px-4 py-2.5 text-sm font-semibold tracking-wide"
        style={{ backgroundColor: scheme.header, color: scheme.headerText }}
      >
        {title}
      </div>
      <div className="px-4 py-4">
        {loading ? (
          <div className="space-y-2">
            <div className="h-8 w-24 animate-pulse rounded bg-rs-border" />
            {showGoal && <div className="h-2 w-full animate-pulse rounded bg-rs-border" />}
          </div>
        ) : (
          <>
            <p className="text-2xl font-bold text-rs-text">{value ?? '—'}</p>
            {subtitle && !showGoal && <p className="mt-0.5 text-xs text-rs-muted">{subtitle}</p>}
            {showGoal && (
              <div className="mt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-rs-muted">{goalLabel}</span>
                  <span className={`text-[11px] font-semibold ${goalTextColor(goalPct)}`}>{Math.round(goalPct)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-rs-border overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${goalBarColor(goalPct)}`}
                    style={{ width: `${Math.min(goalPct, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
