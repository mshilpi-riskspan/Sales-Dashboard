// GET /api/freshdesk/ticket?id=<ticketId>
// Returns { ticket, conversations } for a single Freshdesk ticket.
// Called lazily when the user opens a ticket detail panel.
import { fetchTicketDetail } from '../../_lib/freshdesk.js';

export async function onRequest(context) {
  const { searchParams } = new URL(context.request.url);
  const id = searchParams.get('id');
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing id param' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const result = await fetchTicketDetail(context.env, id);
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
