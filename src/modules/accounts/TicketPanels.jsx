import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import SlidePanel from '../../components/common/SlidePanel';
import { fetchTicketDetail } from '../../datasources/freshdesk';

const FD_STATUS_LABELS = { 2: 'Open', 3: 'Pending', 4: 'Resolved', 5: 'Closed' };
const FD_PRIORITY_LABELS = { 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Urgent' };
const FD_STATUS_COLORS = {
  2: 'bg-blue-100 text-blue-700',
  3: 'bg-amber-100 text-amber-700',
  4: 'bg-green-100 text-green-700',
  5: 'bg-slate-100 text-slate-600',
};
const FD_PRIORITY_COLORS = {
  4: 'bg-red-100 text-red-600',
  3: 'bg-orange-100 text-orange-600',
  2: 'bg-amber-100 text-amber-700',
  1: 'bg-slate-100 text-slate-500',
};

function Row({ label, value }) {
  return (
    <div className="flex justify-between px-3 py-2">
      <span className="text-rs-muted">{label}</span>
      <span className="text-rs-text font-medium">{value}</span>
    </div>
  );
}

// Strip quoted reply blocks and clean up whitespace from plain-text email bodies
function cleanBody(text) {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\xa0/g, ' ')
    .replace(/​/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Parse "Name <email>" → display name, or just the email address
function parseSender(from) {
  if (!from) return 'Unknown';
  const m = from.match(/^"?([^"<]+)"?\s*<([^>]+)>/);
  if (m) return m[1].trim() || m[2].trim();
  return from.trim();
}

function MessageBubble({ body, from, date, incoming, isPrivate }) {
  const sender = parseSender(from);
  const initials = sender.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const body_clean = cleanBody(body);

  const bubbleCls = incoming
    ? 'bg-blue-50 border border-blue-100'
    : isPrivate
    ? 'bg-amber-50 border border-amber-100'
    : 'bg-rs-surface border border-rs-border';

  const avatarCls = incoming
    ? 'bg-blue-200 text-blue-700'
    : isPrivate
    ? 'bg-amber-200 text-amber-700'
    : 'bg-rs-teal/20 text-rs-teal';

  return (
    <div className={`flex gap-3 ${incoming ? '' : 'flex-row-reverse'}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${avatarCls}`}>
        {initials || '?'}
      </div>
      <div className={`flex-1 rounded-lg p-3 text-xs ${bubbleCls}`}>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="font-semibold text-rs-text truncate">{sender}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {isPrivate && (
              <span className="text-[9px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Internal Note</span>
            )}
            <span className="text-rs-muted">{date ? format(new Date(date), 'MMM d, h:mm a') : ''}</span>
          </div>
        </div>
        <p className="text-rs-text whitespace-pre-wrap leading-relaxed">{body_clean}</p>
      </div>
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
                  <td className="py-2 pr-2">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${FD_STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-500'}`}>
                      {FD_STATUS_LABELS[t.status] || t.status}
                    </span>
                  </td>
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
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticket) { setDetail(null); return; }
    setLoading(true);
    setDetail(null);
    fetchTicketDetail(ticket.id)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [ticket?.id]);

  const t = detail?.ticket || ticket;
  const conversations = detail?.conversations || [];
  const description = cleanBody(t?.description_text);

  const firstRespondedHrs = t?.stats?.first_responded_at
    ? Math.round(((new Date(t.stats.first_responded_at) - new Date(t.created_at)) / 3600000) * 10) / 10
    : null;

  return (
    <SlidePanel open={!!ticket} onClose={onClose} title={ticket?.subject || 'Ticket'} subtitle={ticket ? `Ticket #${ticket.id}` : ''} width={580}>
      {ticket && (
        <div className="p-4 space-y-4 h-full overflow-y-auto">
          <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-rs-teal hover:underline">
            ← Back to list
          </button>

          {/* Metadata */}
          <div className="divide-y divide-rs-border/50 border border-rs-border rounded-lg overflow-hidden text-xs">
            <div className="flex justify-between px-3 py-2">
              <span className="text-rs-muted">Status</span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${FD_STATUS_COLORS[t?.status] || 'bg-slate-100 text-slate-500'}`}>
                {FD_STATUS_LABELS[t?.status] || t?.status}
              </span>
            </div>
            <div className="flex justify-between px-3 py-2">
              <span className="text-rs-muted">Priority</span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${FD_PRIORITY_COLORS[t?.priority] || 'bg-slate-100 text-slate-500'}`}>
                {FD_PRIORITY_LABELS[t?.priority] || t?.priority}
              </span>
            </div>
            {t?.type && <Row label="Type" value={t.type} />}
            <Row label="Created" value={t?.created_at ? format(new Date(t.created_at), 'MMM d, yyyy') : '—'} />
            <Row label="Updated" value={t?.updated_at ? format(new Date(t.updated_at), 'MMM d, yyyy') : '—'} />
            <Row label="First Response" value={firstRespondedHrs != null ? `${firstRespondedHrs}h` : '—'} />
            <Row label="Escalated" value={t?.is_escalated ? 'Yes' : 'No'} />
          </div>

          {t?.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {t.tags.map((tag) => (
                <span key={tag} className="text-[10px] bg-rs-surface border border-rs-border rounded-full px-2 py-0.5 text-rs-muted">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Conversation thread */}
          <div>
            <p className="text-[11px] font-semibold text-rs-muted uppercase tracking-wider mb-3">Conversation</p>
            {loading ? (
              <p className="text-xs text-rs-muted">Loading messages…</p>
            ) : (
              <div className="space-y-4">
                {/* Original ticket description */}
                {description && (
                  <MessageBubble
                    body={description}
                    from={null}
                    date={t?.created_at}
                    incoming={true}
                    isPrivate={false}
                  />
                )}
                {/* Replies and notes */}
                {conversations.map((c) => (
                  <MessageBubble
                    key={c.id}
                    body={c.body_text}
                    from={c.from_email}
                    date={c.created_at}
                    incoming={c.incoming}
                    isPrivate={c.private}
                  />
                ))}
                {!description && conversations.length === 0 && (
                  <p className="text-xs text-rs-muted">No message content available.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </SlidePanel>
  );
}
