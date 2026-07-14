const COLOR_SCHEMES = {
  activity:        { header: '#1C2E59', headerText: '#ffffff' },
  pipeline:        { header: '#1C2E59', headerText: '#ffffff' },
  dealProgression: { header: '#1C2E59', headerText: '#ffffff' },
  revenue:         { header: '#1C2E59', headerText: '#ffffff' },
};

export default function KpiCard({
  title, value, subtitle, category = 'pipeline', loading = false, onClick,
  goal, goalLabel, goalPct,
}) {
  const scheme = COLOR_SCHEMES[category] || COLOR_SCHEMES.pipeline;
  const showGoal = goal != null && goalPct != null;
  const pctText = goalPct >= 100 ? 'text-green-600' : goalPct >= 75 ? 'text-amber-600' : 'text-red-500';

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
                  <span className={`text-[11px] font-semibold ${pctText}`}>{Math.round(goalPct)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-rs-border overflow-hidden">
                  <div
                    className="h-full rounded-full bg-rs-teal transition-all"
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
