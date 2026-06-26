import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { SALES_STAGES } from '../../config/salesStages';

const COLORS = ['#1C2E59', '#1a4270', '#175589', '#1268a2', '#0C8EA3', '#0aa09a', '#08b58c'];

function formatCurrency(v) {
  if (!v) return '$0';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border border-rs-border bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-rs-text">{label}</p>
      <p className="text-rs-muted">{payload[0].value} deal{payload[0].value !== 1 ? 's' : ''}</p>
      <p className="text-rs-teal">{formatCurrency(payload[0].payload.totalArr)}</p>
    </div>
  );
};

export default function FunnelBar({ stageData }) {
  const data = SALES_STAGES.map((s, i) => {
    const sd = stageData[s.name] || { deals: [], totalArr: 0 };
    return {
      name: `${s.order}. ${s.name.split(' ').slice(0, 2).join(' ')}`,
      fullName: s.name,
      count: sd.deals.length,
      totalArr: sd.totalArr,
      color: COLORS[i] || COLORS[COLORS.length - 1],
    };
  });

  return (
    <ResponsiveContainer width="100%" height={120}>
      <BarChart data={data} layout="horizontal" margin={{ top: 18, right: 0, bottom: 0, left: 0 }}>
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: '#858C9C' }}
          axisLine={false}
          tickLine={false}
          interval={0}
        />
        <YAxis hide />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(12,142,163,0.08)' }} />
        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
          <LabelList
            dataKey="totalArr"
            position="top"
            formatter={formatCurrency}
            style={{ fontSize: 10, fill: '#858C9C', fontWeight: 500 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
