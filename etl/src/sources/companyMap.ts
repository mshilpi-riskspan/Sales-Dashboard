import type { Env, SyncResult } from '../types';
import type { SnowflakeClient } from '../snowflake';

function uuid(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

export async function syncCompanyMap(sf: SnowflakeClient, _env: Env): Promise<SyncResult[]> {
  const now = new Date().toISOString();
  let upserted = 0;

  // 1. Seed from Salesforce clients (Type IN ('Customer', 'Consulting Client'))
  try {
    const { columns, rows } = await sf.execute(`
      SELECT ID, NAME FROM RS_INTERNAL.RISKSPAN_DASHBOARD_INTERNAL.SF_ACCOUNTS
      WHERE TYPE IN ('Customer', 'Consulting Client')
    `);
    const idIdx = columns.indexOf('ID'), nameIdx = columns.indexOf('NAME');
    for (const row of rows) {
      const sfId = row[idIdx], name = row[nameIdx];
      const existing = await sf.execute(`SELECT ID FROM COMPANY_MAP WHERE SF_ACCOUNT_ID = '${sfId}'`);
      if (existing.rows.length === 0) {
        await sf.execute(`
          INSERT INTO COMPANY_MAP (ID, NAME, SF_ACCOUNT_ID, _SYNCED_AT)
          VALUES ('${uuid()}', '${(name ?? '').replace(/'/g, "''")}', '${sfId}', '${now}')
        `);
        upserted++;
      }
    }
  } catch { /* non-fatal */ }

  // 2. Freshdesk companies — all upserted with NULL SF_ACCOUNT_ID if not already mapped
  try {
    const { columns, rows } = await sf.execute(`
      SELECT ID, NAME FROM RS_INTERNAL.RISKSPAN_DASHBOARD_INTERNAL.FD_COMPANIES
    `);
    const idIdx = columns.indexOf('ID'), nameIdx = columns.indexOf('NAME');
    for (const row of rows) {
      const fdId = row[idIdx], name = row[nameIdx];
      const existing = await sf.execute(`SELECT ID FROM COMPANY_MAP WHERE FD_COMPANY_ID = ${fdId}`);
      if (existing.rows.length === 0) {
        await sf.execute(`
          INSERT INTO COMPANY_MAP (ID, NAME, FD_COMPANY_ID, _SYNCED_AT)
          VALUES ('${uuid()}', '${(name ?? '').replace(/'/g, "''")}', ${fdId}, '${now}')
        `);
        upserted++;
      }
    }
  } catch { /* non-fatal */ }

  // 3. Maxio customers — match via SF_ACCOUNT_ID where available
  try {
    const { columns, rows } = await sf.execute(`
      SELECT ID, SF_ACCOUNT_ID, COMPANY_NAME, NAME FROM RS_INTERNAL.RISKSPAN_DASHBOARD_INTERNAL.MAXIO_CUSTOMERS
    `);
    const idIdx = columns.indexOf('ID'), sfIdx = columns.indexOf('SF_ACCOUNT_ID'), coIdx = columns.indexOf('COMPANY_NAME'), nmIdx = columns.indexOf('NAME');
    for (const row of rows) {
      const maxioId = row[idIdx], sfId = row[sfIdx], coName = row[coIdx] ?? row[nmIdx];
      const existingMaxio = await sf.execute(`SELECT ID FROM COMPANY_MAP WHERE MAXIO_CUSTOMER_ID = ${maxioId}`);
      if (existingMaxio.rows.length > 0) continue;
      if (sfId) {
        // Try to merge into existing SF row
        const sfRow = await sf.execute(`SELECT ID FROM COMPANY_MAP WHERE SF_ACCOUNT_ID = '${sfId}'`);
        if (sfRow.rows.length > 0) {
          await sf.execute(`UPDATE COMPANY_MAP SET MAXIO_CUSTOMER_ID = ${maxioId}, _SYNCED_AT = '${now}' WHERE SF_ACCOUNT_ID = '${sfId}'`);
          continue;
        }
      }
      await sf.execute(`
        INSERT INTO COMPANY_MAP (ID, NAME, SF_ACCOUNT_ID, MAXIO_CUSTOMER_ID, _SYNCED_AT)
        VALUES ('${uuid()}', '${(coName ?? '').replace(/'/g, "''")}', ${sfId ? `'${sfId}'` : 'NULL'}, ${maxioId}, '${now}')
      `);
      upserted++;
    }
  } catch { /* non-fatal */ }

  // 4. DIM_CLIENT entries (Snowflake-only clients)
  try {
    const { columns, rows } = await sf.execute(`
      SELECT CLIENT_ID, CLIENT_NAME, SALESFORCE_ACCOUNT_ID, SNOWFLAKE_CLIENT_IDENTIFIER
      FROM RS_INTERNAL.INNOVATION.DIM_CLIENT
    `);
    const clIdx = columns.indexOf('CLIENT_ID'), nmIdx = columns.indexOf('CLIENT_NAME');
    const sfIdx = columns.indexOf('SALESFORCE_ACCOUNT_ID'), snIdx = columns.indexOf('SNOWFLAKE_CLIENT_IDENTIFIER');
    for (const row of rows) {
      const clientId = row[clIdx], name = row[nmIdx], sfId = row[sfIdx], snowId = row[snIdx];
      const existing = await sf.execute(`SELECT ID FROM COMPANY_MAP WHERE INNOVATION_CLIENT_ID = '${clientId}'`);
      if (existing.rows.length > 0) continue;
      if (sfId) {
        const sfRow = await sf.execute(`SELECT ID FROM COMPANY_MAP WHERE SF_ACCOUNT_ID = '${sfId}'`);
        if (sfRow.rows.length > 0) {
          await sf.execute(`UPDATE COMPANY_MAP SET INNOVATION_CLIENT_ID = '${clientId}', SNOWFLAKE_CLIENT_IDENTIFIER = ${snowId ? `'${snowId}'` : 'NULL'}, _SYNCED_AT = '${now}' WHERE SF_ACCOUNT_ID = '${sfId}'`);
          continue;
        }
      }
      await sf.execute(`
        INSERT INTO COMPANY_MAP (ID, NAME, SF_ACCOUNT_ID, INNOVATION_CLIENT_ID, SNOWFLAKE_CLIENT_IDENTIFIER, _SYNCED_AT)
        VALUES ('${uuid()}', '${(name ?? '').replace(/'/g, "''")}', ${sfId ? `'${sfId}'` : 'NULL'}, '${clientId}', ${snowId ? `'${snowId}'` : 'NULL'}, '${now}')
      `);
      upserted++;
    }
  } catch { /* non-fatal */ }

  return [{ source: 'companyMap', table: 'COMPANY_MAP', upserted }];
}
