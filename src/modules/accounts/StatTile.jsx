// Shared by AccountView.jsx (snapshot tiles) and UsageCategoryPanel.jsx
// (full stat grids inside a drill-down panel).
export default function StatTile({ label, value, delta, sublabel, unavailable, onClick }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      onClick={onClick}
      className={`bg-rs-surface/60 border border-rs-border/50 rounded-lg px-3 py-2 text-left w-full ${onClick ? 'cursor-pointer hover:ring-2 hover:ring-rs-teal/40 transition-shadow' : ''}`}
    >
      <p className="text-[10px] text-rs-muted mb-0.5">{label}</p>
      {unavailable ? (
        <p className="text-xs text-rs-muted italic">Unavailable</p>
      ) : (
        <>
          <p className="text-sm font-semibold text-rs-text">
            {value}
            {delta && <span className="ml-1.5 text-[10px] font-medium text-rs-muted">{delta} vs prior 30d</span>}
          </p>
          {sublabel && <p className="text-[10px] text-rs-muted mt-0.5">{sublabel}</p>}
        </>
      )}
    </Comp>
  );
}
