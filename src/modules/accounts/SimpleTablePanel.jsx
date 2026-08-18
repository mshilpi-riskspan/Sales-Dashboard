import SlidePanel from '../../components/common/SlidePanel';

// Generic list-only panel — for data whose rows are already fully detailed
// (DaaS/RaaS datasets, historical Batch Pipelines), where a third drill
// level would show nothing new. `columns` is [{key, label, render?}], same
// shape as src/components/common/DataTable.jsx's column defs.
export default function SimpleTablePanel({ open, onClose, title, subtitle, columns, rows, rowKey = 'key', chart = null }) {
  return (
    <SlidePanel open={open} onClose={onClose} title={title} subtitle={subtitle} width={640}>
      <div className="p-4 overflow-x-auto">
        {chart}
        {(!rows || rows.length === 0) ? (
          <p className="text-xs text-rs-muted">No data available.</p>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key} className="text-left text-[10px] font-semibold text-rs-muted uppercase tracking-wide pb-1 pr-3 whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row[rowKey] ?? i} className="border-t border-rs-border/50">
                  {columns.map((col) => (
                    <td key={col.key} className="py-1.5 pr-3 text-rs-text whitespace-nowrap">
                      {col.render ? col.render(row) : (row[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </SlidePanel>
  );
}
