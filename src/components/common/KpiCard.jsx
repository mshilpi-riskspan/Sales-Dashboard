const COLOR_SCHEMES = {
  activity: { header: '#FFA91D', headerText: '#7c2d12' },
  pipeline: { header: '#0C8EA3', headerText: '#ffffff' },
  dealProgression: { header: '#16A34A', headerText: '#ffffff' },
  revenue: { header: '#7C3AED', headerText: '#ffffff' },
};

export default function KpiCard({ title, value, subtitle, category = 'pipeline', loading = false }) {
  const scheme = COLOR_SCHEMES[category] || COLOR_SCHEMES.pipeline;

  return (
    <div className="rounded-card border border-rs-border bg-white overflow-hidden">
      <div
        className="px-4 py-2.5 text-sm font-semibold tracking-wide"
        style={{ backgroundColor: scheme.header, color: scheme.headerText }}
      >
        {title}
      </div>
      <div className="px-4 py-4">
        {loading ? (
          <div className="h-8 w-24 animate-pulse rounded bg-rs-border" />
        ) : (
          <>
            <p className="text-2xl font-bold text-rs-text">{value ?? '—'}</p>
            {subtitle && <p className="mt-0.5 text-xs text-rs-muted">{subtitle}</p>}
          </>
        )}
      </div>
    </div>
  );
}
