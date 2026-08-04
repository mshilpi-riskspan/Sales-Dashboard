// GET /api/snowflake/current-clients — bulk, all-clients-at-once Snowflake
// data for the Current Clients page. No client-supplied SQL, ever — every
// query behind this is fixed and server-authored (functions/_lib/currentClients.js).
import { fetchCurrentClientsSnowflakeData } from '../../_lib/currentClients.js';

export async function onRequest(context) {
  try {
    const result = await fetchCurrentClientsSnowflakeData(context.env);
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
