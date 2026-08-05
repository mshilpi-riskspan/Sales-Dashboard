// GET /api/jira/current — bulk recently-updated issue data across every
// Jira project, for the Current Clients page and AccountView.
import { fetchJiraData } from '../../_lib/jira.js';

export async function onRequest(context) {
  try {
    const result = await fetchJiraData(context.env);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
