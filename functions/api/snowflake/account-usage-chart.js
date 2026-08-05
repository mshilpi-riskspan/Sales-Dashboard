// GET /api/snowflake/account-usage-chart?clientId=<hex32>&daysBack=N  OR  ?accountId=<sfid>&daysBack=N
// Daily-grain usage data for the flexible usage chart on AccountView — kept
// separate from account-usage.js's main fan-out so adjusting the chart's
// date range doesn't re-fire the other ~8 unrelated per-account queries.
import { fetchAccountUsageChartData } from '../../_lib/accountUsage.js';

export async function onRequest(context) {
  const { searchParams } = new URL(context.request.url);
  const clientId = searchParams.get('clientId') || undefined;
  const accountId = searchParams.get('accountId') || undefined;
  const daysBack = searchParams.get('daysBack') || undefined;

  try {
    const result = await fetchAccountUsageChartData(context.env, { clientId, accountId, daysBack });
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
