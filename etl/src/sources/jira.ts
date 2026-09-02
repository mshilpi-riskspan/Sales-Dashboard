import type { Env, SyncResult } from '../types';
import type { SnowflakeClient } from '../snowflake';

const PAGE_SIZE = 100;

async function jiraGet(path: string, env: Env): Promise<unknown> {
  const base = env.JIRA_BASE_URL.replace(/\/$/, '');
  const res = await fetch(`${base}${path}`, {
    headers: {
      Authorization: `Basic ${btoa(`${env.JIRA_USERNAME}:${env.JIRA_API_TOKEN}`)}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Jira ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function searchIssues(jql: string, env: Env): Promise<Record<string, unknown>[]> {
  const issues: Record<string, unknown>[] = [];
  let startAt = 0;
  while (true) {
    const data = await jiraGet(
      `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${PAGE_SIZE}&fields=summary,status,issuetype,priority,assignee,reporter,labels,components,created,updated,resolutiondate,project`,
      env
    ) as { issues: Record<string, unknown>[]; total: number };
    issues.push(...data.issues);
    startAt += data.issues.length;
    if (startAt >= data.total) break;
  }
  return issues;
}

export async function syncJira(sf: SnowflakeClient, env: Env): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  const now = new Date().toISOString();
  const watermarkKey = 'jira_issues';

  try {
    const watermark = await sf.getWatermark(watermarkKey, env.ETL_KV);
    // On first run (no watermark) limit to last 90 days to stay under the 50-subrequest cap.
    // Incremental runs use the watermark date so the issue set is always small.
    const cutoff = watermark ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const since = ` AND updated >= "${cutoff}"`;
    const issues = await searchIssues(`project in (LVL3, EDGE, RSA) ORDER BY updated ASC${since}`, env);

    const issueRows = issues.map(i => {
      const f = i.fields as Record<string, unknown>;
      const project = f.project as Record<string, unknown>;
      const status = f.status as Record<string, unknown>;
      const statusCat = (status?.statusCategory as Record<string, unknown>)?.name ?? null;
      const issueType = f.issuetype as Record<string, unknown>;
      const priority = f.priority as Record<string, unknown>;
      const assignee = f.assignee as Record<string, unknown>;
      const reporter = f.reporter as Record<string, unknown>;
      return [
        i.id as string,
        i.key as string,
        (project?.key as string) ?? null,
        (project?.name as string) ?? null,
        (f.summary as string) ?? null,
        (status?.name as string) ?? null,
        statusCat as string | null,
        (issueType?.name as string) ?? null,
        (priority?.name as string) ?? null,
        (assignee?.displayName as string) ?? null,
        (reporter?.displayName as string) ?? null,
        JSON.stringify(f.labels ?? []),
        JSON.stringify((f.components as unknown[])?.map((c: unknown) => (c as Record<string, unknown>).name) ?? []),
        f.created as string,
        f.updated as string,
        (f.resolutiondate as string) ?? null,
        now,
      ];
    });

    const n = await sf.mergeRows('JIRA_ISSUES', 'ID',
      ['ID', 'ISSUE_KEY', 'PROJECT_KEY', 'PROJECT_NAME', 'SUMMARY', 'STATUS', 'STATUS_CATEGORY', 'ISSUE_TYPE', 'PRIORITY', 'ASSIGNEE_NAME', 'REPORTER_NAME', 'LABELS', 'COMPONENTS', 'CREATED', 'UPDATED', 'RESOLUTION_DATE', '_SYNCED_AT'],
      issueRows
    );
    await sf.setWatermark(watermarkKey, now, env.ETL_KV);
    results.push({ source: 'jira', table: 'JIRA_ISSUES', upserted: n });

    // Comments — skip on first run (no watermark) to avoid per-issue subrequest explosion.
    let commentCount = 0;
    if (!watermark) {
      results.push({ source: 'jira', table: 'JIRA_COMMENTS', upserted: 0 });
    }
    for (const issue of watermark ? issues : []) {
      try {
        const data = await jiraGet(`/rest/api/3/issue/${issue.key}/comment?maxResults=100`, env) as { comments: Record<string, unknown>[] };
        const crows = data.comments.map(c => {
          const author = c.author as Record<string, unknown>;
          const bodyText = extractText(c.body);
          return [
            c.id as string,
            issue.key as string,
            (author?.displayName as string) ?? null,
            (author?.emailAddress as string) ?? null,
            bodyText.slice(0, 65000),
            c.created as string,
            c.updated as string,
            now,
          ];
        });
        commentCount += await sf.mergeRows('JIRA_COMMENTS', 'ID',
          ['ID', 'ISSUE_KEY', 'AUTHOR_NAME', 'AUTHOR_EMAIL', 'BODY_TEXT', 'CREATED', 'UPDATED', '_SYNCED_AT'],
          crows
        );
      } catch { /* non-fatal */ }
    }
    results.push({ source: 'jira', table: 'JIRA_COMMENTS', upserted: commentCount });
  } catch (e) {
    results.push({ source: 'jira', table: 'JIRA_ISSUES', upserted: 0, error: String(e) });
  }

  return results;
}

function extractText(node: unknown): string {
  if (!node || typeof node !== 'object') return String(node ?? '');
  const n = node as Record<string, unknown>;
  if (n.type === 'text') return (n.text as string) ?? '';
  if (Array.isArray(n.content)) return (n.content as unknown[]).map(extractText).join('');
  return '';
}
