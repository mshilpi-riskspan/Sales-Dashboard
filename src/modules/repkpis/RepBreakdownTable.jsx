function parseARR(str) {
  if (!str || str === '$0' || str === '—') return 0;
  const n = parseFloat(str.replace(/[$,]/g, ''));
  if (str.includes('M')) return n * 1_000_000;
  if (str.includes('K')) return n * 1_000;
  return n;
}

export default function RepBreakdownTable({ repMetrics }) {
  if (!repMetrics || repMetrics.length === 0) return null;

  const sorted = [...repMetrics].sort((a, b) => {
    const ytd = parseARR(b.arrYtd) - parseARR(a.arrYtd);
    if (ytd !== 0) return ytd;
    return parseARR(b.activePipelineArr) - parseARR(a.activePipelineArr);
  });

  const columns = [
    { key: 'name', label: 'Rep' },
    { key: 'outboundPerWeek', label: 'Emails/Wk' },
    { key: 'meetingsPerMonth', label: 'Meetings/Mo' },
    { key: 'newPipelineArr', label: 'New Pipeline' },
    { key: 'activePipelineArr', label: 'Active Pipeline' },
    { key: 'technicalFitDeals', label: 'Tech Fit Deals' },
    { key: 'trialToProposalRate', label: 'Trial→Prop' },
    { key: 'arrClosedQtr', label: 'ARR This Qtr' },
    { key: 'arrYtd', label: 'ARR YTD' },
    { key: 'winLossRate', label: 'W/L Logged' },
  ];

  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold text-rs-text mb-3">Per-Rep Breakdown</h2>
      <div className="rounded-card border border-rs-border overflow-hidden overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="bg-rs-teal text-white px-3 py-2 text-left text-xs font-semibold tracking-wide whitespace-nowrap"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((rep) => (
              <tr
                key={rep.id}
                className="border-b border-rs-border hover:bg-[#E8EBF2] transition-colors"
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-3 py-2 text-rs-text whitespace-nowrap">
                    {rep[col.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
