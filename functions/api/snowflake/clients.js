// GET /api/snowflake/clients — fixed, read-only query against the
// already-maintained DIM_CLIENT master table (CLIENT_ID, SALESFORCE_ACCOUNT_ID,
// SNOWFLAKE_CLIENT_IDENTIFIER, etc.). No client-supplied SQL, ever.
import { snowflakeQuery } from '../../_lib/snowflake.js';

export async function onRequest(context) {
  try {
    const result = await snowflakeQuery(
      context.env,
      `SELECT CLIENT_ID, CLIENT_NAME, DISPLAY_NAME, SALESFORCE_ACCOUNT_ID,
              SNOWFLAKE_CLIENT_IDENTIFIER, CONTRACT_TIER, IS_ACTIVE,
              IMPLIED_IS_ACTIVE, INDUSTRY, SEGMENT, SALES_LEAD,
              FRESHDESK_COMPANY_ID, JIRA_PROJECT_KEY
       FROM DIM_CLIENT
       ORDER BY COALESCE(DISPLAY_NAME, CLIENT_NAME)`
    );
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
