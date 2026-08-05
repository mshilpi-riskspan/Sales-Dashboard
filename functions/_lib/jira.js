// Jira Cloud connector — bulk fetch of recently-updated issues across EVERY
// project (unscoped, per business decision — this Jira instance has ~15
// dedicated per-client project trackers named after the client itself, e.g.
// "OPS PacLife PretiumProject", not just the general LVL3/EDGE/SUPP support
// projects, so scoping to a fixed project list would miss those). Matching
// to a specific account happens downstream in src/lib/externalDataMatch.js.
//
// Auth: HTTP Basic, Atlassian account email as username + API token as
// password.

const REQUIRED_ENV_VARS = ['JIRA_API_TOKEN', 'JIRA_BASE_URL', 'JIRA_USERNAME'];

function assertConfigured(env) {
  const missing = REQUIRED_ENV_VARS.filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(`Missing Jira env var(s): ${missing.join(', ')}`);
  }
}

function authHeader(env) {
  return 'Basic ' + btoa(`${env.JIRA_USERNAME}:${env.JIRA_API_TOKEN}`);
}

async function jiraFetch(env, body, retriesLeft = 3) {
  const res = await fetch(`${env.JIRA_BASE_URL}/rest/api/3/search/jql`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(env),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429 && retriesLeft > 0) {
    const retryAfter = Number(res.headers.get('Retry-After')) || 2;
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    return jiraFetch(env, body, retriesLeft - 1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira request failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json();
}

const JQL = 'updated >= "-90d" ORDER BY updated DESC';
const FIELDS = [
  'project', 'summary', 'description', 'status', 'priority', 'issuetype',
  'created', 'updated', 'resolutiondate', 'assignee', 'reporter', 'labels', 'components',
];
const MAX_PAGES = 10;

async function fetchAllIssues(env) {
  const issues = [];
  let nextPageToken;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await jiraFetch(env, {
      jql: JQL,
      maxResults: 50,
      fields: FIELDS,
      ...(nextPageToken ? { nextPageToken } : {}),
    });
    issues.push(...(result.issues || []));
    if (result.isLast || !result.nextPageToken) break;
    nextPageToken = result.nextPageToken;
  }
  return issues;
}

export async function fetchJiraData(env) {
  assertConfigured(env);
  try {
    const issues = await fetchAllIssues(env);
    return { issues, failures: [] };
  } catch (err) {
    return { issues: [], failures: ['issues'], error: err.message };
  }
}
