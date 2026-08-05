import { format } from 'date-fns';
import SlidePanel from '../../components/common/SlidePanel';

// Jira's `description` field is Atlassian Document Format (a JSON tree), not
// plain text — walk it and concatenate text nodes rather than pulling in a
// full ADF renderer for one field.
function extractAdfText(doc) {
  if (!doc) return null;
  if (typeof doc === 'string') return doc;
  let text = '';
  function walk(node) {
    if (!node) return;
    if (node.type === 'text' && node.text) text += node.text;
    if (node.type === 'hardBreak' || node.type === 'paragraph') text += '\n';
    (node.content || []).forEach(walk);
  }
  walk(doc);
  return text.trim() || null;
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between px-3 py-2">
      <span className="text-rs-muted">{label}</span>
      <span className="text-rs-text font-medium">{value}</span>
    </div>
  );
}

export function JiraListPanel({ issues, onClose, onIssueClick, title = 'Jira Issues' }) {
  return (
    <SlidePanel
      open={!!issues}
      onClose={onClose}
      title={title}
      subtitle={`${issues?.length || 0} issue${issues?.length === 1 ? '' : 's'} · best-effort match`}
      width={520}
    >
      <div className="p-4">
        {(!issues || issues.length === 0) ? (
          <p className="text-xs text-rs-muted">No issues matched for this account.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-rs-muted uppercase tracking-wide text-[10px] border-b border-rs-border">
                <th className="text-left py-2 pr-2 font-semibold">Key</th>
                <th className="text-left py-2 pr-2 font-semibold">Summary</th>
                <th className="text-left py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((i) => (
                <tr
                  key={i.id}
                  onClick={() => onIssueClick(i)}
                  className="border-b border-rs-border/50 hover:bg-rs-surface cursor-pointer transition-colors"
                >
                  <td className="py-2 pr-2 text-rs-teal font-medium">{i.key}</td>
                  <td className="py-2 pr-2 text-rs-text max-w-[220px] truncate">{i.fields?.summary || '—'}</td>
                  <td className="py-2 text-rs-muted">{i.fields?.status?.name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </SlidePanel>
  );
}

export function JiraDetailPanel({ issue, onClose, onBack }) {
  const description = issue ? extractAdfText(issue.fields?.description) : null;

  return (
    <SlidePanel open={!!issue} onClose={onClose} title={issue?.key || 'Issue'} subtitle={issue?.fields?.summary} width={480}>
      {issue && (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-rs-teal hover:underline">
              ← Back to list
            </button>
            <a
              href={`https://riskspan.atlassian.net/browse/${issue.key}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-rs-teal hover:underline"
            >
              Open in Jira ↗
            </a>
          </div>
          <div className="divide-y divide-rs-border/50 border border-rs-border rounded-lg overflow-hidden text-xs">
            <Row label="Status" value={issue.fields?.status?.name || '—'} />
            <Row label="Priority" value={issue.fields?.priority?.name || '—'} />
            <Row label="Type" value={issue.fields?.issuetype?.name || '—'} />
            <Row label="Assignee" value={issue.fields?.assignee?.displayName || 'Unassigned'} />
            <Row label="Reporter" value={issue.fields?.reporter?.displayName || '—'} />
            <Row label="Created" value={issue.fields?.created ? format(new Date(issue.fields.created), 'MMM d, yyyy') : '—'} />
            <Row label="Updated" value={issue.fields?.updated ? format(new Date(issue.fields.updated), 'MMM d, yyyy') : '—'} />
          </div>
          {description && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-rs-muted mb-1.5">Description</p>
              <div className="bg-rs-surface rounded-lg px-3 py-2.5">
                <p className="text-xs text-rs-text leading-relaxed whitespace-pre-line">{description}</p>
              </div>
            </div>
          )}
          {(issue.fields?.labels?.length > 0 || issue.fields?.components?.length > 0) && (
            <div className="flex flex-wrap gap-1">
              {(issue.fields?.labels || []).map((l) => (
                <span key={l} className="text-[10px] bg-rs-surface border border-rs-border rounded-full px-2 py-0.5 text-rs-muted">{l}</span>
              ))}
              {(issue.fields?.components || []).map((c) => (
                <span key={c.id || c.name} className="text-[10px] bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5 text-blue-700">{c.name}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </SlidePanel>
  );
}
