import { SignJWT, importPKCS8 } from 'jose';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envRaw = readFileSync(resolve(__dirname, '../.env'), 'utf8');
const env = {};
for (const line of envRaw.split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
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
  return new SignJWT({}).setProtectedHeader({ alg: 'RS256' }).setIssuer(`${acct}.${user}.${fp}`).setSubject(`${acct}.${user}`).setIssuedAt(now).setExpirationTime(now + 3600).sign(pk);
}
async function query(sql) {
  const jwt = await getJwt();
  const res = await fetch(`https://${env.SNOWFLAKE_ACCOUNT}.snowflakecomputing.com/api/v2/statements?async=false`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}`, 'X-Snowflake-Authorization-Token-Type': 'KEYPAIR_JWT', Accept: 'application/json', 'User-Agent': 'inspect/1.0' },
    body: JSON.stringify({ statement: sql, warehouse: env.SNOWFLAKE_WAREHOUSE, database: 'RS_INTERNAL', schema: 'INNOVATION', role: 'INNOVATION_RW_ROLE', timeout: 30 }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || JSON.stringify(json));
  const cols = json.resultSetMetaData?.rowType?.map(c => c.name) ?? [];
  return (json.data ?? []).map(r => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
}

const sample = await query('SELECT * FROM DIM_CLIENT LIMIT 5');
console.log('\n=== DIM_CLIENT — columns ===');
console.log(Object.keys(sample[0]).join('\n'));

console.log('\n=== Sample rows (5) ===');
for (const row of sample) console.log(JSON.stringify(row));

const coverage = await query(`
  SELECT
    COUNT(*) AS TOTAL_ROWS,
    COUNT(SALESFORCE_ACCOUNT_ID)                         AS HAS_SF_ID,
    COUNT(FRESHDESK_COMPANY_ID)                          AS HAS_FD_ID,
    COUNT(JIRA_PROJECT_KEY)                              AS HAS_JIRA_KEY,
    COUNT(SNOWFLAKE_CLIENT_IDENTIFIER)                   AS HAS_SNOWFLAKE_ID,
    SUM(CASE WHEN IS_ACTIVE = 'true' THEN 1 ELSE 0 END)  AS ACTIVE_CLIENTS
  FROM DIM_CLIENT
`);
console.log('\n=== ID coverage ===');
console.table(coverage);
