// GET /api/snowflake/test — proves the connection works. Runs one fixed,
// harmless read-only statement; never accepts client-supplied SQL.
import { snowflakeQuery } from '../../_lib/snowflake.js';

export async function onRequest(context) {
  try {
    const result = await snowflakeQuery(context.env, 'SELECT 1 AS OK');
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
