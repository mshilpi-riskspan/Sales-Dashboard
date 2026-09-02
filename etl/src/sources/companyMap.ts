import type { Env, SyncResult } from '../types';
import type { SnowflakeClient } from '../snowflake';

export async function syncCompanyMap(sf: SnowflakeClient, _env: Env): Promise<SyncResult[]> {
  const now = new Date().toISOString();
  let upserted = 0;

  // 1. SF accounts (Customer / Consulting Client) → seed COMPANY_MAP rows
  try {
    const r = await sf.execute(`
      INSERT INTO COMPANY_MAP (ID, NAME, SF_ACCOUNT_ID, _SYNCED_AT)
      SELECT UUID_STRING(), NAME, ID, '${now}'
      FROM SF_ACCOUNTS
      WHERE TYPE IN ('Customer', 'Consulting Client')
        AND NOT EXISTS (
          SELECT 1 FROM COMPANY_MAP c WHERE c.SF_ACCOUNT_ID = SF_ACCOUNTS.ID
        )
    `);
    upserted += parseInt(r.rows[0]?.[0] ?? '0', 10);
  } catch { /* non-fatal */ }

  // 2. FD companies → new COMPANY_MAP rows (null SF link, mapped manually via UI)
  try {
    const r = await sf.execute(`
      INSERT INTO COMPANY_MAP (ID, NAME, FD_COMPANY_ID, _SYNCED_AT)
      SELECT UUID_STRING(), NAME, ID, '${now}'
      FROM FD_COMPANIES
      WHERE NOT EXISTS (
        SELECT 1 FROM COMPANY_MAP c WHERE c.FD_COMPANY_ID = FD_COMPANIES.ID
      )
    `);
    upserted += parseInt(r.rows[0]?.[0] ?? '0', 10);
  } catch { /* non-fatal */ }

  // 3a. Maxio — link to existing SF rows where SF_ACCOUNT_ID matches
  try {
    await sf.execute(`
      UPDATE COMPANY_MAP
      SET MAXIO_CUSTOMER_ID = m.ID, _SYNCED_AT = '${now}'
      FROM MAXIO_CUSTOMERS m
      WHERE COMPANY_MAP.SF_ACCOUNT_ID = m.SF_ACCOUNT_ID
        AND m.SF_ACCOUNT_ID IS NOT NULL
        AND COMPANY_MAP.MAXIO_CUSTOMER_ID IS NULL
    `);
  } catch { /* non-fatal */ }

  // 3b. Maxio — new rows for unmatched customers
  try {
    const r = await sf.execute(`
      INSERT INTO COMPANY_MAP (ID, NAME, SF_ACCOUNT_ID, MAXIO_CUSTOMER_ID, _SYNCED_AT)
      SELECT UUID_STRING(), COALESCE(COMPANY_NAME, NAME), SF_ACCOUNT_ID, ID, '${now}'
      FROM MAXIO_CUSTOMERS
      WHERE NOT EXISTS (
        SELECT 1 FROM COMPANY_MAP c WHERE c.MAXIO_CUSTOMER_ID = MAXIO_CUSTOMERS.ID
      )
    `);
    upserted += parseInt(r.rows[0]?.[0] ?? '0', 10);
  } catch { /* non-fatal */ }

  // 4a. DIM_CLIENT — link innovation IDs to existing SF rows
  try {
    await sf.execute(`
      UPDATE COMPANY_MAP
      SET INNOVATION_CLIENT_ID = dc.CLIENT_ID,
          SNOWFLAKE_CLIENT_IDENTIFIER = dc.SNOWFLAKE_CLIENT_IDENTIFIER,
          _SYNCED_AT = '${now}'
      FROM RS_INTERNAL.INNOVATION.DIM_CLIENT dc
      WHERE COMPANY_MAP.SF_ACCOUNT_ID = dc.SALESFORCE_ACCOUNT_ID
        AND dc.SALESFORCE_ACCOUNT_ID IS NOT NULL
        AND COMPANY_MAP.INNOVATION_CLIENT_ID IS NULL
    `);
  } catch { /* non-fatal */ }

  // 4b. DIM_CLIENT — new rows for Snowflake-only clients
  try {
    const r = await sf.execute(`
      INSERT INTO COMPANY_MAP (ID, NAME, SF_ACCOUNT_ID, INNOVATION_CLIENT_ID, SNOWFLAKE_CLIENT_IDENTIFIER, _SYNCED_AT)
      SELECT UUID_STRING(), dc.CLIENT_NAME, dc.SALESFORCE_ACCOUNT_ID, dc.CLIENT_ID, dc.SNOWFLAKE_CLIENT_IDENTIFIER, '${now}'
      FROM RS_INTERNAL.INNOVATION.DIM_CLIENT dc
      WHERE NOT EXISTS (
        SELECT 1 FROM COMPANY_MAP c WHERE c.INNOVATION_CLIENT_ID = dc.CLIENT_ID
      )
    `);
    upserted += parseInt(r.rows[0]?.[0] ?? '0', 10);
  } catch { /* non-fatal */ }

  return [{ source: 'companyMap', table: 'COMPANY_MAP', upserted }];
}
