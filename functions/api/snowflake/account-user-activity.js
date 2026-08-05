// GET /api/snowflake/account-user-activity?clientId=<hex32>&userIds=<id1,id2>&daysBack=N  OR  ?accountId=<sfid>&userIds=<id1,id2>&daysBack=N
// Daily forecast + query run counts summed across one or more users — powers
// both the single-user row expand and the aggregate chart when the Users
// filter in the Usage panel has users selected.
import { fetchUserActivity } from '../../_lib/accountUsage.js';

export async function onRequest(context) {
  const { searchParams } = new URL(context.request.url);
  const clientId = searchParams.get('clientId') || undefined;
  const accountId = searchParams.get('accountId') || undefined;
  const userIds = searchParams.get('userIds') || undefined;
  const daysBack = searchParams.get('daysBack') || undefined;

  try {
    const result = await fetchUserActivity(context.env, { clientId, accountId, userIds, daysBack });
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
