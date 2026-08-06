// Cycling palette for the optional group-header row — assigned by first
// appearance in `columns` rather than hardcoded per group name, so any
// caller's column groups (however many, whatever they're called) get a
// stable, distinguishable color without DataTable needing to know about
// specific group semantics.
const GROUP_PALETTE = [
  'bg-slate-700', 'bg-rose-600', 'bg-teal-600', 'bg-amber-600', 'bg-emerald-600',
  'bg-indigo-600', 'bg-cyan-700', 'bg-orange-600', 'bg-purple-600', 'bg-blue-700',
];

function buildGroupSegments(columns) {
  const segments = [];
  const colorByGroup = new Map();
  for (const col of columns) {
    const group = col.group || null;
    const last = segments[segments.length - 1];
    if (last && last.group === group) {
      last.count += 1;
      continue;
    }
    if (group && !colorByGroup.has(group)) {
      colorByGroup.set(group, GROUP_PALETTE[colorByGroup.size % GROUP_PALETTE.length]);
    }
    segments.push({ group, count: 1, color: group ? colorByGroup.get(group) : null });
  }
  return segments;
}

export default function DataTable({ columns, rows, getRowClassName, onRowClick, sortKey, sortDir, onSort }) {
  if (!rows || rows.length === 0) return null;

  const groupSegments = columns.some((c) => c.group) ? buildGroupSegments(columns) : null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          {groupSegments && (
            <tr>
              {groupSegments.map((seg, i) => (
                <th
                  key={i}
                  colSpan={seg.count}
                  className={`px-3 py-1 text-left font-semibold text-[10px] uppercase tracking-widest whitespace-nowrap text-white/90 first:rounded-tl last:rounded-tr ${seg.color || 'bg-rs-navy'}`}
                >
                  {seg.group || ''}
                </th>
              ))}
            </tr>
          )}
          <tr>
            {columns.map((col) => {
              const isSorted = onSort && sortKey === col.key;
              return (
                <th
                  key={col.key}
                  onClick={onSort ? () => onSort(col.key) : undefined}
                  className={`bg-rs-teal text-white px-3 py-2 text-left font-semibold text-xs tracking-wide whitespace-nowrap ${groupSegments ? '' : 'first:rounded-tl last:rounded-tr'} ${onSort ? 'cursor-pointer select-none hover:bg-rs-teal/90' : ''}`}
                >
                  {col.label}
                  {isSorted && <span className="ml-1">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const extra = getRowClassName ? getRowClassName(row) : '';
            return (
              <tr
                key={row.Id || i}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-rs-border hover:bg-[#E8EBF2] transition-colors ${onRowClick ? 'cursor-pointer' : ''} ${extra}`}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-3 py-2 whitespace-nowrap">
                    {col.render ? col.render(row) : (row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
