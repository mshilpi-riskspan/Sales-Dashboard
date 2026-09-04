import { useState } from 'react';
import { format } from 'date-fns';
import SlidePanel from '../../components/common/SlidePanel';
import { TicketDetailPanel } from '../accounts/TicketPanels';
import { JiraDetailPanel } from '../accounts/JiraPanels';

const DEFAULT_STATUS_LABELS = {
  2: 'Open', 3: 'Pending', 4: 'Resolved', 5: 'Closed',
  6: 'Working on Query', 7: 'Waiting on Customer', 10: 'Pending LVL3/EDGE',
};
const FD_STATUS_COLORS = {
  2: 'bg-blue-100 text-blue-700',
  3: 'bg-amber-100 text-amber-700',
  4: 'bg-green-100 text-green-700',
  5: 'bg-slate-100 text-slate-600',
  6: 'bg-purple-100 text-purple-700',
  7: 'bg-orange-100 text-orange-600',
  10: 'bg-red-100 text-red-600',
};

const JIRA_KEY_RE = /^(LVL3|EDGE|RSA)-\d+$/;

export default function TicketDrillPanel({ tickets, title, jiraIssues = [], companiesById = new Map(), statusLabels, onClose }) {
  const FD_STATUS_LABELS = statusLabels ?? DEFAULT_STATUS_LABELS;
  const [activeTicket, setActiveTicket] = useState(null);
  const [activeJira, setActiveJira] = useState(null);

  function handleJiraTag(key, e) {
    e.stopPropagation();
    const issue = jiraIssues.find((i) => i.key === key);
    if (issue) {
      setActiveJira(issue);
    } else {
      window.open(`https://riskspan.atlassian.net/browse/${key}`, '_blank', 'noopener noreferrer');
    }
  }

  if (activeJira) {
    return (
      <JiraDetailPanel
        issue={activeJira}
        onClose={onClose}
        onBack={() => setActiveJira(null)}
      />
    );
  }

  if (activeTicket) {
    return (
      <TicketDetailPanel
        ticket={activeTicket}
        onClose={onClose}
        onBack={() => setActiveTicket(null)}
      />
    );
  }

  return (
    <SlidePanel
      open={!!(tickets && tickets.length >= 0)}
      onClose={() => { setActiveTicket(null); setActiveJira(null); onClose(); }}
      title={title}
      subtitle={`${tickets?.length ?? 0} ticket${tickets?.length === 1 ? '' : 's'}`}
      width={580}
    >
      <div className="p-4">
        {!tickets || tickets.length === 0 ? (
          <p className="text-xs text-rs-muted">No tickets in this group.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-rs-muted uppercase tracking-wide text-[10px] border-b border-rs-border">
                <th className="text-left py-2 pr-3 font-semibold">Subject</th>
                <th className="text-left py-2 pr-3 font-semibold">Status</th>
                <th className="text-left py-2 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => {
                const jiraTags = (t.tags || []).filter((tag) => JIRA_KEY_RE.test(tag));
                return (
                  <tr
                    key={t.id}
                    onClick={() => setActiveTicket(t)}
                    className="border-b border-rs-border/50 hover:bg-rs-surface cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 pr-3">
                      <p className="text-rs-text truncate max-w-[260px]">{t.subject || '—'}</p>
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        {t.company_id && companiesById.get(t.company_id) && (
                          <span className="text-[9px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 rounded-full px-1.5 py-0.5">
                            {companiesById.get(t.company_id)}
                          </span>
                        )}
                        {jiraTags.map((tag) => (
                          <button
                            key={tag}
                            onClick={(e) => handleJiraTag(tag, e)}
                            className="text-[9px] font-semibold bg-rs-teal/10 text-rs-teal border border-rs-teal/20 rounded-full px-1.5 py-0.5 hover:bg-rs-teal/20 transition-colors"
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${FD_STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-500'}`}>
                        {FD_STATUS_LABELS[t.status] || `Status ${t.status}`}
                      </span>
                    </td>
                    <td className="py-2.5 text-rs-muted whitespace-nowrap">
                      {t.updated_at ? format(new Date(t.updated_at), 'MMM d') : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </SlidePanel>
  );
}
