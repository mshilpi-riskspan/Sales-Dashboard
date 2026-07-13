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
  const { totalArr, count, avgArr } = payload[0].payload;
  return (
    <div className="rounded border border-rs-border bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-rs-text">{label}</p>
      <p className="text-rs-muted">{count} deal{count !== 1 ? 's' : ''}</p>
      <p className="text-rs-teal">Total: {formatCurrency(totalArr)}</p>
      <p className="text-rs-muted">Avg ARR: {formatCurrency(avgArr)}</p>
    </div>
  );
};

function BarLabel({ x, y, width, value }) {
  if (!value) return null;
  const { count, avgArr, totalArr } = value;
  const cx = x + width / 2;
  return (
    <g>
      <text x={cx} y={y - 25} textAnchor="middle" fontSize={10} fontWeight={600} fill="#303036">
        {count}
      </text>
      <text x={cx} y={y - 14} textAnchor="middle" fontSize={9} fill="#0C8EA3" fontWeight={500}>
        {formatCurrency(totalArr)}
      </text>
      <text x={cx} y={y - 3} textAnchor="middle" fontSize={9} fill="#858C9C">
        {formatCurrency(avgArr)} avg
      </text>
    </g>
  );
}

export default function FunnelBar({ stageData }) {
  const data = SALES_STAGES.filter((s) => s.name !== 'Closed Won').map((s, i) => {
    const sd = stageData[s.name] || { deals: [], totalArr: 0 };
    const count = sd.deals.length;
    return {
      name: `${s.order}. ${s.name.split(' ').slice(0, 2).join(' ')}`,
      fullName: s.name,
      count,
      totalArr: sd.totalArr,
      avgArr: count > 0 ? Math.round(sd.totalArr / count) : 0,
      color: COLORS[i] || COLORS[COLORS.length - 1],
    };
  });

  return (
    <ResponsiveContainer width="100%" height={155}>
      <BarChart data={data} layout="horizontal" margin={{ top: 46, right: 0, bottom: 0, left: 0 }}>
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
            dataKey="count"
            content={(props) => <BarLabel {...props} value={data[props.index]} />}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
