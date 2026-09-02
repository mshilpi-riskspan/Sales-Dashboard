// Quick ETL validation — queries RS_INTERNAL.INNOVATION tables and prints
// counts/samples so you can compare against what the live APIs return.
import { SignJWT, importPKCS8 } from 'jose';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually
const envPath = resolve(__dirname, '../.env');
const envRaw = readFileSync(envPath, 'utf8');
const env = {};
for (const line of envRaw.split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
}

function normalizePem(raw) {
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
}
function pemToDer(pem) {
  const body = pem.replace(/-----BEGIN [^-]+-----/, '').replace(/-----END [^-]+-----/, '').replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function bufferToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
async function computeFingerprint(pem) {
  const der = pemToDer(pem);
  const privateKey = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, ['sign']);
  const jwk = await crypto.subtle.exportKey('jwk', privateKey);
  const publicKey = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, ['verify']);
  const spki = await crypto.subtle.exportKey('spki', publicKey);
  const digest = await crypto.subtle.digest('SHA-256', spki);
  return `SHA256:${bufferToBase64(digest)}`;
}
async function getJwt() {
  const pem = normalizePem(env.SNOWFLAKE_PRIVATE_KEY);
  const account = env.SNOWFLAKE_ACCOUNT.toUpperCase();
  const user = env.SNOWFLAKE_USER.toUpperCase();
  const fingerprint = await computeFingerprint(pem);
  const privateKey = await importPKCS8(pem, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({}).setProtectedHeader({ alg: 'RS256' }).setIssuer(`${account}.${user}.${fingerprint}`).setSubject(`${account}.${user}`).setIssuedAt(now).setExpirationTime(now + 3600).sign(privateKey);
}

async function query(sql) {
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
        'User-Agent': 'etl-test/1.0',
      },
      body: JSON.stringify({
        statement: sql,
        warehouse: env.SNOWFLAKE_WAREHOUSE,
        database: env.SNOWFLAKE_DATABASE,
        schema: env.SNOWFLAKE_SCHEMA,
        timeout: 30,
      }),
    }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(`Snowflake error (${res.status}): ${json.message || JSON.stringify(json)}`);
  const cols = json.resultSetMetaData?.rowType?.map(c => c.name) ?? [];
  const rows = (json.data ?? []).map(r => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
  return rows;
}

async function run() {
  console.log('\n=== Snowflake ETL Validation ===\n');

  // 1. Freshdesk ticket count + most recent 5 tickets
  console.log('--- 1. Freshdesk Tickets (STG_FRESHDESK_TICKETS) ---');
  const fdCount = await query(`SELECT COUNT(*) as CNT, MAX(UPDATED_AT) as LATEST FROM STG_FRESHDESK_TICKETS`);
  console.log(`Total tickets: ${fdCount[0].CNT}  |  Latest updated_at: ${fdCount[0].LATEST}`);
  const fdRecent = await query(`SELECT TICKET_ID, SUBJECT, STATUS_NAME, UPDATED_AT FROM STG_FRESHDESK_TICKETS ORDER BY UPDATED_AT DESC LIMIT 5`);
  console.table(fdRecent);

  // 2. Jira issues count + recent
  console.log('\n--- 2. Jira Issues (STG_JIRA_ISSUES) ---');
  const jiraCount = await query(`SELECT COUNT(*) as CNT, MAX(UPDATED) as LATEST FROM STG_JIRA_ISSUES`);
  console.log(`Total issues: ${jiraCount[0].CNT}  |  Latest updated: ${jiraCount[0].LATEST}`);
  const jiraRecent = await query(`SELECT ISSUE_KEY, SUMMARY, STATUS, UPDATED FROM STG_JIRA_ISSUES ORDER BY UPDATED DESC LIMIT 5`);
  console.table(jiraRecent);

  // 3. Maxio contracts — count + sample
  console.log('\n--- 3. Maxio Contracts (STG_MAXIO_CONTRACTS) ---');
  const maxioCount = await query(`SELECT COUNT(*) as CNT, MAX(MODIFIED) as LATEST FROM STG_MAXIO_CONTRACTS`);
  console.log(`Total contracts: ${maxioCount[0].CNT}  |  Latest modified: ${maxioCount[0].LATEST}`);
  const maxioSample = await query(`SELECT CONTRACT_ID, CONTRACT_NUMBER, IS_ACTIVE, MODIFIED FROM STG_MAXIO_CONTRACTS ORDER BY MODIFIED DESC LIMIT 5`);
  console.table(maxioSample);

  // 4. Client health scorecard — latest snapshot per client
  console.log('\n--- 4. Client Health Scorecard (CLIENT_HEALTH_SCORECARD) ---');
  const scoreCount = await query(`SELECT COUNT(DISTINCT CLIENT_ID) as CLIENTS, MAX(SNAPSHOT_AT) as LATEST FROM CLIENT_HEALTH_SCORECARD`);
  console.log(`Clients scored: ${scoreCount[0].CLIENTS}  |  Latest snapshot: ${scoreCount[0].LATEST}`);
  const scores = await query(`SELECT CLIENT_ID, SNAPSHOT_AT, OVERALL_SCORE, SUPPORT_SCORE, USAGE_SCORE, COMMERCIAL_SCORE FROM CLIENT_HEALTH_SCORECARD ORDER BY SNAPSHOT_AT DESC LIMIT 10`);
  console.table(scores);
}

run().catch(console.error);
