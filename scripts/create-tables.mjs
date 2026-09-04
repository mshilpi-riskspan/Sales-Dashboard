import { SignJWT, importPKCS8 } from 'jose';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envRaw = readFileSync(resolve(__dirname, '../.env'), 'utf8');
const env = {};
for (const line of envRaw.split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
}

function normalizePem(raw) { return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw; }
function pemToDer(pem) {
  const body = pem.replace(/-----BEGIN [^-]+-----/, '').replace(/-----END [^-]+-----/, '').replace(/\s+/g, '');
  const binary = atob(body); const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); return bytes;
}
function b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
async function fingerprint(pem) {
  const der = pemToDer(pem);
  const pk = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, ['sign']);
  const jwk = await crypto.subtle.exportKey('jwk', pk);
  const pub = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, ['verify']);
  const spki = await crypto.subtle.exportKey('spki', pub);
  return 'SHA256:' + b64(await crypto.subtle.digest('SHA-256', spki));
}
async function getJwt() {
  const pem = normalizePem(env.SNOWFLAKE_PRIVATE_KEY);
  const acct = env.SNOWFLAKE_ACCOUNT.toUpperCase(), user = env.SNOWFLAKE_USER.toUpperCase();
  const fp = await fingerprint(pem);
  const pk = await importPKCS8(pem, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({}).setProtectedHeader({ alg: 'RS256' })
    .setIssuer(`${acct}.${user}.${fp}`).setSubject(`${acct}.${user}`)
    .setIssuedAt(now).setExpirationTime(now + 3600).sign(pk);
}

async function sql(statement, schema = 'RISKSPAN_DASHBOARD_INTERNAL') {
  const jwt = await getJwt();
  const res = await fetch(
    `https://${env.SNOWFLAKE_ACCOUNT}.snowflakecomputing.com/api/v2/statements?async=false`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
        'X-Snowflake-Authorization-Token-Type': 'KEYPAIR_JWT',
        Accept: 'application/json',
        'User-Agent': 'create-tables/1.0',
      },
      body: JSON.stringify({
        statement,
        warehouse: env.SNOWFLAKE_WAREHOUSE,
        database: 'RS_INTERNAL',
        schema,
        role: 'INNOVATION_RW_ROLE',
        timeout: 60,
      }),
    }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(`(${res.status}) ${json.message || JSON.stringify(json)}`);
  return json;
}

const TABLES = [
  // ── Mapping backbone ────────────────────────────────────────────────────────
  ['COMPANY_MAP', `
    ID                          VARCHAR(36)  PRIMARY KEY,
    NAME                        VARCHAR(500),
    SF_ACCOUNT_ID               VARCHAR(18)  UNIQUE,
    FD_COMPANY_ID               NUMBER       UNIQUE,
    MAXIO_CUSTOMER_ID           NUMBER       UNIQUE,
    ASTRONOMER_TAG              VARCHAR(500) UNIQUE,
    JIRA_LABEL                  VARCHAR(500) UNIQUE,
    SNOWFLAKE_CLIENT_IDENTIFIER VARCHAR(200) UNIQUE,
    _SYNCED_AT                  TIMESTAMP_TZ
  `],
  ['SOURCE_ID_MAP', `
    SOURCE        VARCHAR(50),
    SOURCE_KEY    VARCHAR(500),
    SF_ACCOUNT_ID VARCHAR(18),
    PRIMARY KEY (SOURCE, SOURCE_KEY)
  `],
  // ── Salesforce ──────────────────────────────────────────────────────────────
  ['SF_ACCOUNTS', `
    ID                   VARCHAR(18)  PRIMARY KEY,
    NAME                 VARCHAR(500),
    INDUSTRY             VARCHAR(200),
    TYPE                 VARCHAR(100),
    WEBSITE              VARCHAR(500),
    PHONE                VARCHAR(50),
    DESCRIPTION          TEXT,
    BILLING_CITY         VARCHAR(200),
    BILLING_STATE        VARCHAR(200),
    OWNER_ID             VARCHAR(18),
    OWNER_NAME           VARCHAR(200),
    ACCOUNT_TYPE_TIER    VARCHAR(200),
    CURRENT_ARR          FLOAT,
    SAASOPTICS_ARR       FLOAT,
    SALES_NEXT_STEPS     TEXT,
    EXISTING_CONNECTIONS TEXT,
    ANNUAL_REVENUE       FLOAT,
    LAST_ACTIVITY_DATE   DATE,
    LAST_MODIFIED_DATE   TIMESTAMP_TZ,
    _SYNCED_AT           TIMESTAMP_TZ
  `],
  ['SF_OPPORTUNITIES', `
    ID                      VARCHAR(18)  PRIMARY KEY,
    ACCOUNT_ID              VARCHAR(18),
    ACCOUNT_NAME            VARCHAR(500),
    NAME                    VARCHAR(500),
    STAGE_NAME              VARCHAR(100),
    AMOUNT                  FLOAT,
    ARR                     FLOAT,
    ONE_TIME_FEES           FLOAT,
    OWNER_ID                VARCHAR(18),
    OWNER_NAME              VARCHAR(200),
    CREATED_DATE            TIMESTAMP_TZ,
    LAST_STAGE_CHANGE_DATE  TIMESTAMP_TZ,
    CLOSE_DATE              DATE,
    NEXT_STEP               TEXT,
    FORECAST_CATEGORY       VARCHAR(100),
    IS_CLOSED               BOOLEAN,
    IS_WON                  BOOLEAN,
    TYPE                    VARCHAR(100),
    LINE_OF_BUSINESS        VARCHAR(200),
    PRIMARY_MODULE          VARCHAR(200),
    LEAD_SOURCE             VARCHAR(200),
    DESCRIPTION             TEXT,
    LOSS_REASON             VARCHAR(500),
    LOSS_REASON_EXPLANATION TEXT,
    WON_REASON              VARCHAR(500),
    LAST_MODIFIED_DATE      TIMESTAMP_TZ,
    _SYNCED_AT              TIMESTAMP_TZ
  `],
  ['SF_CONTACTS', `
    ID                 VARCHAR(18)  PRIMARY KEY,
    ACCOUNT_ID         VARCHAR(18),
    FIRST_NAME         VARCHAR(200),
    LAST_NAME          VARCHAR(200),
    TITLE              VARCHAR(300),
    EMAIL              VARCHAR(300),
    PHONE              VARCHAR(50),
    LAST_ACTIVITY_DATE DATE,
    LAST_MODIFIED_DATE TIMESTAMP_TZ,
    _SYNCED_AT         TIMESTAMP_TZ
  `],
  ['SF_TASKS', `
    ID                 VARCHAR(18)  PRIMARY KEY,
    ACCOUNT_ID         VARCHAR(18),
    ACCOUNT_NAME       VARCHAR(500),
    OWNER_ID           VARCHAR(18),
    OWNER_NAME         VARCHAR(200),
    TYPE               VARCHAR(100),
    SUBJECT            VARCHAR(500),
    ACTIVITY_DATE      DATE,
    CREATED_DATE       TIMESTAMP_TZ,
    LAST_MODIFIED_DATE TIMESTAMP_TZ,
    STATUS             VARCHAR(100),
    DESCRIPTION        TEXT,
    _SYNCED_AT         TIMESTAMP_TZ
  `],
  ['SF_EVENTS', `
    ID                 VARCHAR(18)  PRIMARY KEY,
    ACCOUNT_ID         VARCHAR(18),
    ACCOUNT_NAME       VARCHAR(500),
    OWNER_ID           VARCHAR(18),
    OWNER_NAME         VARCHAR(200),
    TYPE               VARCHAR(100),
    SUBJECT            VARCHAR(500),
    START_DATETIME     TIMESTAMP_TZ,
    END_DATETIME       TIMESTAMP_TZ,
    LAST_MODIFIED_DATE TIMESTAMP_TZ,
    DESCRIPTION        TEXT,
    _SYNCED_AT         TIMESTAMP_TZ
  `],
  ['SF_CAMPAIGNS', `
    ID                      VARCHAR(18)  PRIMARY KEY,
    NAME                    VARCHAR(500),
    TYPE                    VARCHAR(100),
    STATUS                  VARCHAR(100),
    IS_ACTIVE               BOOLEAN,
    NUMBER_OF_LEADS         NUMBER,
    NUMBER_OF_CONTACTS      NUMBER,
    NUMBER_OF_OPPORTUNITIES NUMBER,
    NUMBER_OF_WON_OPPS      NUMBER,
    AMOUNT_WON_OPPS         FLOAT,
    CAMPAIGN_INDUSTRY       VARCHAR(200),
    OWNER_ID                VARCHAR(18),
    OWNER_NAME              VARCHAR(200),
    LAST_MODIFIED_DATE      TIMESTAMP_TZ,
    _SYNCED_AT              TIMESTAMP_TZ
  `],
  // ── Freshdesk ───────────────────────────────────────────────────────────────
  ['FD_TICKETS', `
    ID                 NUMBER       PRIMARY KEY,
    COMPANY_ID         NUMBER,
    SUBJECT            VARCHAR(2000),
    TYPE               VARCHAR(200),
    STATUS             NUMBER,
    PRIORITY           NUMBER,
    IS_ESCALATED       BOOLEAN,
    TAGS               VARIANT,
    CREATED_AT         TIMESTAMP_TZ,
    UPDATED_AT         TIMESTAMP_TZ,
    FIRST_RESPONDED_AT TIMESTAMP_TZ,
    _SYNCED_AT         TIMESTAMP_TZ
  `],
  ['FD_CONVERSATIONS', `
    ID          NUMBER       PRIMARY KEY,
    TICKET_ID   NUMBER,
    COMPANY_ID  NUMBER,
    BODY_TEXT   TEXT,
    AUTHOR_NAME VARCHAR(500),
    FROM_EMAIL  VARCHAR(300),
    INCOMING    BOOLEAN,
    PRIVATE     BOOLEAN,
    CREATED_AT  TIMESTAMP_TZ,
    UPDATED_AT  TIMESTAMP_TZ,
    _SYNCED_AT  TIMESTAMP_TZ
  `],
  ['FD_COMPANIES', `
    ID          NUMBER       PRIMARY KEY,
    NAME        VARCHAR(500),
    DESCRIPTION TEXT,
    NOTE        TEXT,
    _SYNCED_AT  TIMESTAMP_TZ
  `],
  // ── Jira ────────────────────────────────────────────────────────────────────
  ['JIRA_ISSUES', `
    ID              VARCHAR(50)  PRIMARY KEY,
    ISSUE_KEY       VARCHAR(50),
    PROJECT_KEY     VARCHAR(50),
    PROJECT_NAME    VARCHAR(200),
    SUMMARY         VARCHAR(1000),
    STATUS          VARCHAR(100),
    STATUS_CATEGORY VARCHAR(50),
    ISSUE_TYPE      VARCHAR(100),
    PRIORITY        VARCHAR(50),
    ASSIGNEE_NAME   VARCHAR(200),
    REPORTER_NAME   VARCHAR(200),
    LABELS          VARIANT,
    COMPONENTS      VARIANT,
    CREATED         TIMESTAMP_TZ,
    UPDATED         TIMESTAMP_TZ,
    RESOLUTION_DATE TIMESTAMP_TZ,
    _SYNCED_AT      TIMESTAMP_TZ
  `],
  ['JIRA_COMMENTS', `
    ID           VARCHAR(50)  PRIMARY KEY,
    ISSUE_KEY    VARCHAR(50),
    AUTHOR_NAME  VARCHAR(200),
    AUTHOR_EMAIL VARCHAR(300),
    BODY_TEXT    TEXT,
    CREATED      TIMESTAMP_TZ,
    UPDATED      TIMESTAMP_TZ,
    _SYNCED_AT   TIMESTAMP_TZ
  `],
  // ── Maxio ───────────────────────────────────────────────────────────────────
  ['MAXIO_CUSTOMERS', `
    ID            NUMBER       PRIMARY KEY,
    SF_ACCOUNT_ID VARCHAR(18),
    NAME          VARCHAR(500),
    COMPANY_NAME  VARCHAR(500),
    _SYNCED_AT    TIMESTAMP_TZ
  `],
  ['MAXIO_CONTRACTS', `
    ID          NUMBER PRIMARY KEY,
    CUSTOMER_ID NUMBER,
    _SYNCED_AT  TIMESTAMP_TZ
  `],
  ['MAXIO_ITEMS', `
    ID         NUMBER       PRIMARY KEY,
    NAME       VARCHAR(500),
    _SYNCED_AT TIMESTAMP_TZ
  `],
  ['MAXIO_TRANSACTIONS', `
    ID                  NUMBER PRIMARY KEY,
    CONTRACT_ID         NUMBER,
    CUSTOMER_ID         NUMBER,
    ITEM_ID             NUMBER,
    ITEM_NAME           VARCHAR(500),
    HOME_ARR_AMOUNT     FLOAT,
    HOME_AMOUNT         FLOAT,
    START_DATE          DATE,
    END_DATE            DATE,
    CANCELLED           BOOLEAN,
    IS_AUTORENEWAL      BOOLEAN,
    IS_ACTIVE           BOOLEAN,
    INVOICE_DESCRIPTION TEXT,
    _SYNCED_AT          TIMESTAMP_TZ
  `],
  // ── Astronomer ──────────────────────────────────────────────────────────────
  ['ASTRONOMER_DAGS', `
    DAG_ID                VARCHAR(500) PRIMARY KEY,
    IS_PAUSED             BOOLEAN,
    HAS_IMPORT_ERRORS     BOOLEAN,
    TAGS                  VARIANT,
    NEXT_DAGRUN_RUN_AFTER TIMESTAMP_TZ,
    _SYNCED_AT            TIMESTAMP_TZ
  `],
  ['ASTRONOMER_DAG_RUNS', `
    DAG_ID     VARCHAR(500),
    STATE      VARCHAR(50),
    START_DATE TIMESTAMP_TZ,
    END_DATE   TIMESTAMP_TZ,
    DURATION   FLOAT,
    _SYNCED_AT TIMESTAMP_TZ,
    PRIMARY KEY (DAG_ID, START_DATE)
  `],
];

async function run() {
  console.log('\n=== RiskSpan Dashboard ETL — Schema + Table Setup ===\n');

  // Step 0: Rename old schema if it still exists
  console.log('--- Step 0: Schema rename (if needed) ---');
  try {
    await sql(
      'ALTER SCHEMA RS_INTERNAL.RISKSPAN_DASHBOARD RENAME TO RS_INTERNAL.RISKSPAN_DASHBOARD_INTERNAL',
      'INNOVATION'
    );
    console.log('✅  Renamed RISKSPAN_DASHBOARD → RISKSPAN_DASHBOARD_INTERNAL');
  } catch (e) {
    if (e.message.includes('does not exist') || e.message.includes('not found') || e.message.includes('Object') ) {
      console.log('ℹ️   Already renamed or does not exist — skipping');
    } else if (e.message.includes('already exists')) {
      console.log('ℹ️   RISKSPAN_DASHBOARD_INTERNAL already exists — skipping rename');
    } else {
      console.warn('⚠️   Rename skipped:', e.message);
    }
  }

  // Step 1: Ensure schema exists
  console.log('\n--- Step 1: Create schema ---');
  await sql(
    "CREATE SCHEMA IF NOT EXISTS RS_INTERNAL.RISKSPAN_DASHBOARD_INTERNAL COMMENT = 'RiskSpan Dashboard ETL — sales dashboard internal data source'",
    'INNOVATION'
  );
  console.log('✅  Schema RS_INTERNAL.RISKSPAN_DASHBOARD_INTERNAL ready');

  // Step 2: Create all tables
  console.log(`\n--- Step 2: Creating ${TABLES.length} tables ---`);
  let ok = 0, fail = 0;
  for (const [name, cols] of TABLES) {
    try {
      await sql(`CREATE TABLE IF NOT EXISTS ${name} (${cols})`);
      console.log(`  ✅  ${name}`);
      ok++;
    } catch (e) {
      console.error(`  ❌  ${name}: ${e.message}`);
      fail++;
    }
  }

  console.log(`\n=== Done — ${ok} tables created/verified, ${fail} failed ===`);
}

run().catch(console.error);
