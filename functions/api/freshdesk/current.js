// GET /api/freshdesk/current — bulk ticket + company data for the Current
// Clients page and AccountView. Fixed, server-authored fetch — no
// client-supplied input, ever.
import { fetchFreshdeskData } from '../../_lib/freshdesk.js';

export async function onRequest(context) {
  try {
    const result = await fetchFreshdeskData(context.env);
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
