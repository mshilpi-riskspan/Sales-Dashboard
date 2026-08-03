// GET /api/snowflake/account-usage?clientId=<hex32>  OR  ?accountId=<sfid>
// Resolves the Snowflake DIM_CLIENT.CLIENT_ID for one account (directly, or
// via its Salesforce Account ID) and fans out the read-only usage/health/
// support/commercial queries for it. No client-supplied SQL, ever — both
// inputs are validated against a strict format regex before use.
import { fetchAccountUsage } from '../../_lib/accountUsage.js';

export async function onRequest(context) {
  const { searchParams } = new URL(context.request.url);
  const clientId = searchParams.get('clientId') || undefined;
  const accountId = searchParams.get('accountId') || undefined;

  try {
    const result = await fetchAccountUsage(context.env, { clientId, accountId });
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
