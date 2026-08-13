// GET /api/maxio/customers — one of four separately-invoked Maxio resource
// endpoints (see functions/_lib/maxio.js for why this is split into four
// instead of one combined fetch). Fixed, server-authored fetch — no
// client-supplied input, ever.
import { fetchMaxioCustomers } from '../../_lib/maxio.js';

export async function onRequest(context) {
  try {
    const result = await fetchMaxioCustomers(context.env);
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
