import { differenceInDays } from 'date-fns';
import Badge from '../../components/common/Badge';

function formatARR(v) {
  if (!v && v !== 0) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

export default function DealRow({ deal, stageConfig, onClick }) {
  const dateStr = deal.LastStageChangeDate || deal.CreatedDate;
  const daysInStage = dateStr ? differenceInDays(new Date(), new Date(dateStr)) : 0;
  const isOverdue = stageConfig?.dayLimit && daysInStage > stageConfig.dayLimit;
  const daysOver = isOverdue ? daysInStage - stageConfig.dayLimit : 0;

  const arr = deal.Annual_Recurring_Revenue_ARR__c ?? deal.Amount;

  return (
    <tr
      onClick={() => onClick?.(deal)}
      className={`border-b border-rs-border transition-colors ${onClick ? 'cursor-pointer' : ''} ${
        isOverdue
          ? 'bg-[rgba(232,138,26,0.12)] hover:bg-[rgba(232,138,26,0.18)]'
          : 'hover:bg-[#E8EBF2]'
      }`}
    >
      <td className={`px-3 py-2 text-sm font-medium ${isOverdue ? 'text-rs-overdueText' : 'text-rs-text'}`}>
        {deal.Account?.Name || deal.Name || '—'}
      </td>
      <td className={`px-3 py-2 text-sm ${isOverdue ? 'text-rs-overdueText' : 'text-rs-muted'}`}>
        {deal.Owner?.Name || '—'}
      </td>
      <td className={`px-3 py-2 text-sm font-medium ${isOverdue ? 'text-rs-overdueText' : 'text-rs-text'}`}>
        {formatARR(arr)}
      </td>
      <td className="px-3 py-2 text-sm">
        <div className="flex items-center gap-2">
          <span className={isOverdue ? 'text-rs-overdueText font-semibold' : 'text-rs-muted'}>
            {daysInStage}d
          </span>
          {isOverdue && (
            <Badge variant="overdue">+{daysOver}d over</Badge>
          )}
        </div>
      </td>
    </tr>
  );
}
