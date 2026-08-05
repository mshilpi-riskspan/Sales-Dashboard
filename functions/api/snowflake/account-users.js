// GET /api/snowflake/account-users?clientId=<hex32>&daysBack=N  OR  ?accountId=<sfid>&daysBack=N
// Per-user usage summary (forecast + query runs, loans/securities breakdown)
// for the Users drill-down on AccountView.
import { fetchAccountUsers } from '../../_lib/accountUsage.js';

export async function onRequest(context) {
  const { searchParams } = new URL(context.request.url);
  const clientId = searchParams.get('clientId') || undefined;
  const accountId = searchParams.get('accountId') || undefined;
  const daysBack = searchParams.get('daysBack') || undefined;

  try {
    const result = await fetchAccountUsers(context.env, { clientId, accountId, daysBack });
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
