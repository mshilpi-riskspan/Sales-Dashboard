// GET /api/snowflake/account-user-activity?clientId=<hex32>&userId=<id>&daysBack=N  OR  ?accountId=<sfid>&userId=<id>&daysBack=N
// Daily forecast-run counts for one user, for the click-to-expand drill-down
// in the Users panel.
import { fetchUserActivity } from '../../_lib/accountUsage.js';

export async function onRequest(context) {
  const { searchParams } = new URL(context.request.url);
  const clientId = searchParams.get('clientId') || undefined;
  const accountId = searchParams.get('accountId') || undefined;
  const userId = searchParams.get('userId') || undefined;
  const daysBack = searchParams.get('daysBack') || undefined;

  try {
    const result = await fetchUserActivity(context.env, { clientId, accountId, userId, daysBack });
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
