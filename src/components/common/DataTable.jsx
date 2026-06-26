export default function DataTable({ columns, rows, getRowClassName }) {
  if (!rows || rows.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="bg-rs-teal text-white px-3 py-2 text-left font-semibold text-xs tracking-wide whitespace-nowrap first:rounded-tl last:rounded-tr"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const extra = getRowClassName ? getRowClassName(row) : '';
            return (
              <tr
                key={row.Id || i}
                className={`border-b border-rs-border hover:bg-[#E8EBF2] transition-colors ${extra}`}
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
