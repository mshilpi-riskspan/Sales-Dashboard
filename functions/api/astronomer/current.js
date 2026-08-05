// GET /api/astronomer/current — live DAG list + recent run history, for the
// Current Clients page and AccountView.
import { fetchAstronomerData } from '../../_lib/astronomer.js';

export async function onRequest(context) {
  try {
    const result = await fetchAstronomerData(context.env);
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
