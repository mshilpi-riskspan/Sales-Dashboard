// GET /api/maxio/current — bulk customer/contract/transaction/item data for
// the Current Clients page and AccountView. Fixed, server-authored fetch —
// no client-supplied input, ever.
import { fetchMaxioData } from '../../_lib/maxio.js';

export async function onRequest(context) {
  try {
    const result = await fetchMaxioData(context.env);
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
