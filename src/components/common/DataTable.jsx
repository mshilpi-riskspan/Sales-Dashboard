export default function DataTable({ columns, rows, getRowClassName, onRowClick, sortKey, sortDir, onSort }) {
  if (!rows || rows.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {columns.map((col) => {
              const isSorted = onSort && sortKey === col.key;
              return (
                <th
                  key={col.key}
                  onClick={onSort ? () => onSort(col.key) : undefined}
                  className={`bg-rs-teal text-white px-3 py-2 text-left font-semibold text-xs tracking-wide whitespace-nowrap first:rounded-tl last:rounded-tr ${onSort ? 'cursor-pointer select-none hover:bg-rs-teal/90' : ''}`}
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
