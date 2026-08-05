import { format } from 'date-fns';
import SlidePanel from '../../components/common/SlidePanel';

const FD_STATUS_LABELS = { 2: 'Open', 3: 'Pending', 4: 'Resolved', 5: 'Closed' };
const FD_PRIORITY_LABELS = { 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Urgent' };

function Row({ label, value }) {
  return (
    <div className="flex justify-between px-3 py-2">
      <span className="text-rs-muted">{label}</span>
      <span className="text-rs-text font-medium">{value}</span>
    </div>
  );
}

export function TicketListPanel({ tickets, onClose, onTicketClick }) {
  return (
    <SlidePanel
      open={!!tickets}
      onClose={onClose}
      title="Support Tickets (Freshdesk)"
      subtitle={`${tickets?.length || 0} ticket${tickets?.length === 1 ? '' : 's'} · best-effort match`}
      width={520}
    >
      <div className="p-4">
        {(!tickets || tickets.length === 0) ? (
          <p className="text-xs text-rs-muted">No tickets matched for this account.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-rs-muted uppercase tracking-wide text-[10px] border-b border-rs-border">
                <th className="text-left py-2 pr-2 font-semibold">Subject</th>
                <th className="text-left py-2 pr-2 font-semibold">Status</th>
                <th className="text-left py-2 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => onTicketClick(t)}
                  className="border-b border-rs-border/50 hover:bg-rs-surface cursor-pointer transition-colors"
                >
                  <td className="py-2 pr-2 text-rs-text max-w-[220px] truncate">{t.subject || '—'}</td>
                  <td className="py-2 pr-2 text-rs-muted">{FD_STATUS_LABELS[t.status] || t.status}</td>
                  <td className="py-2 text-rs-muted">{t.updated_at ? format(new Date(t.updated_at), 'MMM d') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </SlidePanel>
  );
}

export function TicketDetailPanel({ ticket, onClose, onBack }) {
  const firstRespondedHrs = ticket?.stats?.first_responded_at
    ? Math.round(((new Date(ticket.stats.first_responded_at) - new Date(ticket.created_at)) / 3600000) * 10) / 10
    : null;

  return (
    <SlidePanel open={!!ticket} onClose={onClose} title={ticket?.subject || 'Ticket'} subtitle={ticket ? `Ticket #${ticket.id}` : ''} width={480}>
      {ticket && (
        <div className="p-4 space-y-4">
          <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-rs-teal hover:underline">
            ← Back to list
          </button>
          <div className="divide-y divide-rs-border/50 border border-rs-border rounded-lg overflow-hidden text-xs">
            <Row label="Status" value={FD_STATUS_LABELS[ticket.status] || ticket.status} />
            <Row label="Priority" value={FD_PRIORITY_LABELS[ticket.priority] || ticket.priority} />
            {ticket.type && <Row label="Type" value={ticket.type} />}
            <Row label="Created" value={ticket.created_at ? format(new Date(ticket.created_at), 'MMM d, yyyy') : '—'} />
            <Row label="Updated" value={ticket.updated_at ? format(new Date(ticket.updated_at), 'MMM d, yyyy') : '—'} />
            <Row label="First Response" value={firstRespondedHrs != null ? `${firstRespondedHrs}h` : '—'} />
            <Row label="Escalated" value={ticket.is_escalated ? 'Yes' : 'No'} />
          </div>
          {ticket.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {ticket.tags.map((tag) => (
                <span key={tag} className="text-[10px] bg-rs-surface border border-rs-border rounded-full px-2 py-0.5 text-rs-muted">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </SlidePanel>
  );
}
