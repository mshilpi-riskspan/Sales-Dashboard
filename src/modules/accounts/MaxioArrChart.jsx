import { useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';

// Exact — no $XM/$XK abbreviation/rounding. At this precision, "$2.0M" for
// an actual $1,950,492 ARR (what 1-decimal M rounding produces) reads as
// materially wrong, so every figure here is the full dollar amount.
function formatMoney(v) {
  if (v === null || v === undefined) return '—';
  return `$${Math.round(v).toLocaleString()}`;
}

// Trailing-24-month Maxio ARR trend — see buildMaxioArrSeries in
// src/lib/externalDataMatch.js for how each month's value is derived from
// the same subscription line items shown in the table below.
export default function MaxioArrChart({ data, compact = false }) {
  const domain = useMemo(() => {
    if (!data) return [0, 0];
    const values = data.map((d) => d.arr).filter((v) => v > 0);
    if (values.length === 0) return [0, 0];
    const min = Math.min(...values);
    const max = Math.max(...values);
    // Scale the axis to where the data actually sits, not a $0 baseline —
    // a tight ARR band (e.g. $1.9M-$2.0M) otherwise renders as a flat line
    // pinned to the top of a mostly-empty $0-$2M chart.
    const pad = Math.max((max - min) * 0.15, max * 0.02, 1);
    return [Math.max(0, Math.floor(min - pad)), Math.ceil(max + pad)];
  }, [data]);

  if (!data || data.every((d) => d.arr === 0)) return null;

  const first = data.find((d) => d.arr > 0)?.arr;
  const last = data[data.length - 1]?.arr;
  const delta = first != null && last != null ? last - first : null;

  return (
    <div className={compact ? '' : 'mb-4 pb-4 border-b border-rs-border'}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-rs-muted">ARR Trend (24mo)</p>
        {delta != null && delta !== 0 && (
          <span className={`text-xs font-semibold ${delta > 0 ? 'text-green-600' : 'text-rs-overdueText'}`}>
            {delta > 0 ? '▲' : '▼'} {formatMoney(Math.abs(delta))}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#858C9C' }} axisLine={false} tickLine={false} interval={2} />
          <YAxis
            domain={domain}
            tick={{ fontSize: 10, fill: '#858C9C' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={formatMoney}
            width={72}
          />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #DADEE5' }}
            formatter={(v) => [formatMoney(v), 'ARR']}
          />
          <Line type="monotone" dataKey="arr" stroke="#0C8EA3" strokeWidth={2} dot={false} name="ARR" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
