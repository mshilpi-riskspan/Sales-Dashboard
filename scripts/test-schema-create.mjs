// One-shot test: can our Snowflake user create RS_INTERNAL.RISKSPAN_DASHBOARD?
// Runs CREATE SCHEMA IF NOT EXISTS — safe to re-run, no data touched.
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
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(`${account}.${user}.${fingerprint}`)
    .setSubject(`${account}.${user}`)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);
}

async function sql(statement, role) {
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
        'User-Agent': 'etl-setup/1.0',
      },
      body: JSON.stringify({
        statement,
        warehouse: env.SNOWFLAKE_WAREHOUSE,
        database: 'RS_INTERNAL',
        schema: 'INNOVATION',
        ...(role ? { role } : {}),
        timeout: 30,
      }),
    }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(`Snowflake error (${res.status}): ${json.message || JSON.stringify(json)}`);
  return json;
}

async function run() {
  console.log('\n=== Snowflake Access Test ===\n');

  // 1. Check current role + user
  console.log('--- Current session ---');
  const session = await sql('SELECT CURRENT_USER(), CURRENT_ROLE(), CURRENT_DATABASE(), CURRENT_SCHEMA()');
  const [user, role, db, schema] = session.data[0];
  console.log(`User: ${user}  Role: ${role}  DB: ${db}  Schema: ${schema}`);

  // 2. List available roles
  console.log('\n--- Roles granted to this user ---');
  try {
    const roles = await sql('SHOW GRANTS TO USER ' + user);
    const cols = roles.resultSetMetaData?.rowType?.map(c => c.name) ?? [];
    const rows = (roles.data ?? []).map(r => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
    console.table(rows.map(r => ({ role: r.role || r.ROLE, granted_by: r.granted_by || r.GRANTED_BY })));
  } catch (e) {
    console.log('Could not list roles:', e.message);
  }

  // 3. Try creating the schema
  console.log('\n--- Attempting CREATE SCHEMA RS_INTERNAL.RISKSPAN_DASHBOARD ---');
  try {
    await sql('CREATE SCHEMA IF NOT EXISTS RS_INTERNAL.RISKSPAN_DASHBOARD COMMENT = \'RiskSpan Dashboard ETL — sales dashboard data source\'', 'INNOVATION_RW_ROLE');
    console.log('✅  Schema created (or already existed) — full write access confirmed.');
  } catch (e) {
    console.log('❌  Schema creation failed:', e.message);
    console.log('\nYou will need a Snowflake admin (SYSADMIN) to run:');
    console.log('  CREATE SCHEMA IF NOT EXISTS RS_INTERNAL.RISKSPAN_DASHBOARD;');
    console.log('  GRANT ALL ON SCHEMA RS_INTERNAL.RISKSPAN_DASHBOARD TO ROLE <your_role>;');
  }
}

run().catch(console.error);
