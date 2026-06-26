import { format } from 'date-fns';
import SlidePanel from '../../components/common/SlidePanel';

function formatARR(v) {
  if (!v && v !== 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

function OppsTable({ records, onDealClick }) {
  const sorted = [...(records || [])].sort(
    (a, b) => (b.Annual_Recurring_Revenue_ARR__c ?? b.Amount ?? 0) - (a.Annual_Recurring_Revenue_ARR__c ?? a.Amount ?? 0)
  );
  return (
    <table className="w-full">
      <thead>
        <tr className="text-rs-muted uppercase tracking-wide text-[10px] border-b border-rs-border">
          <th className="text-left py-2 pr-3 font-semibold">Account</th>
          <th className="text-left py-2 pr-3 font-semibold">Stage</th>
          <th className="text-right py-2 pr-3 font-semibold">ARR</th>
          <th className="text-right py-2 font-semibold">Close</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((deal) => {
          const arr = deal.Annual_Recurring_Revenue_ARR__c ?? deal.Amount;
          const isPast = deal.CloseDate && new Date(deal.CloseDate) < new Date();
          return (
            <tr
              key={deal.Id}
              onClick={() => onDealClick?.(deal)}
              className={`border-b border-rs-border transition-colors ${onDealClick ? 'hover:bg-rs-surface cursor-pointer' : ''}`}
            >
              <td className="py-2 pr-3 text-xs font-medium text-rs-text">
                {deal.Account?.Name || deal.Name || '—'}
              </td>
              <td className="py-2 pr-3 text-xs text-rs-muted">{deal.StageName}</td>
              <td className="py-2 pr-3 text-xs text-right font-semibold text-rs-text">{formatARR(arr)}</td>
              <td className={`py-2 text-xs text-right ${isPast ? 'text-rs-overdueText font-medium' : 'text-rs-muted'}`}>
                {deal.CloseDate ? format(new Date(deal.CloseDate), 'MMM d') : '—'}
              </td>
            </tr>
          );
        })}
        {!sorted.length && (
          <tr><td colSpan={4} className="py-6 text-center text-xs text-rs-muted">No records</td></tr>
        )}
      </tbody>
    </table>
  );
}

function ActivitiesTable({ records }) {
  return (
    <div>
      {(records || []).map((a, i) => {
        const date = a.ActivityDate || a.StartDateTime;
        const type = a.Type || (a._src === 'event' ? 'Event' : 'Task');
        return (
          <div key={a.Id || i} className="flex gap-3 py-2.5 border-b border-rs-border/50 last:border-0">
            <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded bg-rs-surface text-rs-muted uppercase tracking-wide mt-0.5">
              {type}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-rs-text leading-snug">{a.Subject || '—'}</p>
              <p className="text-[10px] text-rs-muted mt-0.5">
                {date ? format(new Date(date), 'MMM d, yyyy') : '—'}
                {a.Owner?.Name ? ` · ${a.Owner.Name}` : ''}
              </p>
            </div>
          </div>
        );
      })}
      {!records?.length && <p className="py-6 text-center text-xs text-rs-muted">No records</p>}
    </div>
  );
}

export default function KpiDrillPanel({ title, records, type, onClose, onDealClick }) {
  return (
    <SlidePanel
      open={!!records}
      onClose={onClose}
      title={title}
      subtitle={`${records?.length || 0} record${records?.length !== 1 ? 's' : ''}`}
      width={520}
    >
      <div className="p-4">
        {type === 'opps' ? (
          <OppsTable records={records} onDealClick={onDealClick} />
        ) : (
          <ActivitiesTable records={records} />
        )}
      </div>
    </SlidePanel>
  );
}
