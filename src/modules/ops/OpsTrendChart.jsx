import { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

function groupByWeek(series) {
  const weeks = new Map();
  for (const pt of series) {
    const d = new Date(pt.date + 'T00:00:00');
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    const existing = weeks.get(key) ?? { date: key, success: 0, failed: 0 };
    existing.success += pt.success;
    existing.failed  += pt.failed;
    weeks.set(key, existing);
  }
  return Array.from(weeks.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function fmtDate(d) {
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const s = payload.find(p => p.dataKey === 'success')?.value ?? 0;
  const f = payload.find(p => p.dataKey === 'failed')?.value ?? 0;
  const total = s + f;
  return (
    <div className="bg-white border border-rs-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-rs-text mb-1">{fmtDate(label)}</p>
      <p className="text-green-600">{s} success</p>
      <p className="text-red-500">{f} failed</p>
      {total > 0 && <p className="text-rs-muted mt-0.5">{Math.round((s / total) * 100)}% health</p>}
    </div>
  );
};

export default function OpsTrendChart({ series }) {
  const [grain, setGrain] = useState('daily');

  const data = useMemo(() =>
    grain === 'weekly' ? groupByWeek(series) : series,
    [series, grain]
  );

  return (
    <div className="rounded-card border border-rs-border bg-white overflow-hidden mb-6">
      <div className="flex items-center justify-between px-4 py-3 border-b border-rs-border">
        <div>
          <h3 className="text-sm font-semibold text-rs-text">Run Trend</h3>
          <p className="text-[10px] text-rs-muted mt-0.5">Success vs failed runs across all clients</p>
        </div>
        <div className="flex gap-1">
          {[['daily', 'Daily'], ['weekly', 'Weekly']].map(([v, l]) => (
            <button
              key={v}
              onClick={() => setGrain(v)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${grain === v ? 'bg-rs-teal text-white' : 'text-rs-muted hover:text-rs-text hover:bg-rs-surface'}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 py-4" style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barSize={grain === 'weekly' ? 20 : 10} barGap={0}>
            <XAxis
              dataKey="date"
              tickFormatter={fmtDate}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              interval={grain === 'weekly' ? 0 : 6}
            />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={28} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="success" stackId="a" fill="#4ade80" name="Success" radius={[0, 0, 0, 0]} />
            <Bar dataKey="failed"  stackId="a" fill="#f87171" name="Failed"  radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
