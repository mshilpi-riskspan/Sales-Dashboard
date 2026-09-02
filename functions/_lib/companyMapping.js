import { snowflakeQuery } from './snowflake.js';
import { SignJWT, importPKCS8 } from 'jose';
import { rowsToObjects } from './snowflakeRows.js';

export const ALLOWED_FIELDS = new Set([
  'SF_ACCOUNT_ID',
  'FD_COMPANY_ID',
  'MAXIO_CUSTOMER_ID',
  'INNOVATION_CLIENT_ID',
  'SNOWFLAKE_CLIENT_IDENTIFIER',
]);
const NUMERIC_FIELDS = new Set(['FD_COMPANY_ID', 'MAXIO_CUSTOMER_ID']);
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GET_SQL = `
  SELECT
    cm.ID,
    cm.NAME,
    cm.SF_ACCOUNT_ID,
    sf.NAME AS SF_ACCOUNT_NAME,
    cm.FD_COMPANY_ID,
    fd.NAME AS FD_COMPANY_NAME,
    cm.MAXIO_CUSTOMER_ID,
    mc.NAME AS MAXIO_CUSTOMER_NAME,
    cm.INNOVATION_CLIENT_ID,
    cm.SNOWFLAKE_CLIENT_IDENTIFIER,
    cm._SYNCED_AT
  FROM RS_INTERNAL.RISKSPAN_DASHBOARD_INTERNAL.COMPANY_MAP cm
  LEFT JOIN RS_INTERNAL.RISKSPAN_DASHBOARD_INTERNAL.SF_ACCOUNTS sf ON cm.SF_ACCOUNT_ID = sf.ID
  LEFT JOIN RS_INTERNAL.RISKSPAN_DASHBOARD_INTERNAL.FD_COMPANIES fd ON cm.FD_COMPANY_ID = fd.ID
  LEFT JOIN RS_INTERNAL.RISKSPAN_DASHBOARD_INTERNAL.MAXIO_CUSTOMERS mc ON cm.MAXIO_CUSTOMER_ID = mc.ID
  ORDER BY cm.NAME NULLS LAST
`;

export async function fetchCompanyMap(env) {
  const result = await snowflakeQuery(env, GET_SQL);
  return rowsToObjects(result);
}

function normalizePem(raw) {
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
}

function pemToDer(pem) {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bufferToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

async function computePublicKeyFingerprint(pem) {
  const der = pemToDer(pem);
  const privateKey = await crypto.subtle.importKey(
    'pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, ['sign']
  );
  const jwk = await crypto.subtle.exportKey('jwk', privateKey);
  const publicKey = await crypto.subtle.importKey(
    'jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, ['verify']
  );
  const spki = await crypto.subtle.exportKey('spki', publicKey);
  const digest = await crypto.subtle.digest('SHA-256', spki);
  return `SHA256:${bufferToBase64(digest)}`;
}

async function getJwt(env) {
  const pem = normalizePem(env.SNOWFLAKE_PRIVATE_KEY);
  const account = env.SNOWFLAKE_ACCOUNT.toUpperCase();
  const user = env.SNOWFLAKE_USER.toUpperCase();
  const fingerprint = await computePublicKeyFingerprint(pem);
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

async function snowflakeWrite(env, statement) {
  const jwt = await getJwt(env);
  const res = await fetch(
    `https://${env.SNOWFLAKE_ACCOUNT}.snowflakecomputing.com/api/v2/statements?async=false`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
        'X-Snowflake-Authorization-Token-Type': 'KEYPAIR_JWT',
        Accept: 'application/json',
        'User-Agent': 'riskspan-dashboard/1.0',
      },
      body: JSON.stringify({
        statement,
        warehouse: env.SNOWFLAKE_WAREHOUSE,
        database: 'RS_INTERNAL',
        schema: 'RISKSPAN_DASHBOARD_INTERNAL',
        role: env.SNOWFLAKE_ROLE || 'INNOVATION_RW_ROLE',
        timeout: 30,
      }),
    }
  );
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Snowflake error (${res.status}): ${json.message || JSON.stringify(json)}`);
  }
  return json;
}

function formatSqlValue(field, value) {
  if (value === null || value === undefined || value === '') return 'NULL';
  if (NUMERIC_FIELDS.has(field)) {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error(`${field} must be a number`);
    return String(Math.floor(n));
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

export async function updateCompanyMapField(env, id, field, value) {
  if (!UUID_RE.test(String(id))) throw new Error('Invalid id');
  if (!ALLOWED_FIELDS.has(field)) throw new Error(`Field '${field}' is not editable`);
  const sqlValue = formatSqlValue(field, value);
  await snowflakeWrite(
    env,
    `UPDATE RS_INTERNAL.RISKSPAN_DASHBOARD_INTERNAL.COMPANY_MAP
     SET ${field} = ${sqlValue}, _SYNCED_AT = CURRENT_TIMESTAMP()
     WHERE ID = '${String(id).replace(/'/g, "''")}'`
  );
}
