// Shared Snowflake connector — imported by both the deployed Cloudflare Pages
// Functions (functions/api/snowflake/*.js) and the local Vite dev server
// middleware (vite.config.js), so behavior matches in dev and prod.
//
// READ-ONLY BY DESIGN:
//   1. The Snowflake role/user should itself be granted SELECT-only privileges
//      (enforced on the Snowflake side, outside this app).
//   2. Every statement is checked here and rejected unless it starts with
//      SELECT/WITH/SHOW/DESCRIBE, and statement-stacking via a second `;` is
//      rejected outright.
//   3. The browser never sends raw SQL — only fixed, server-authored queries
//      defined in this codebase ever reach snowflakeQuery().
import { SignJWT, importPKCS8 } from 'jose';

function normalizePem(raw) {
  // Cloudflare's dashboard accepts real multi-line PEM; .env files are safest
  // with literal \n escapes on one line. Support both.
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

// Snowflake's key-pair JWT auth requires the `iss`/`sub` claims to embed the
// SHA-256 fingerprint of the PUBLIC key currently registered on the user —
// derived here from the private key rather than requiring a second env var.
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

// SNOWFLAKE_ROLE/DATABASE/SCHEMA/WAREHOUSE are all intentionally optional —
// the Snowflake SQL API falls back to whatever defaults are set on the user
// (default role/warehouse/namespace) when they're omitted from the request.
// Only the connection identity itself is strictly required. If you rely on
// the role fallback, make sure the default role is SELECT-only in Snowflake.
const REQUIRED_ENV_VARS = ['SNOWFLAKE_ACCOUNT', 'SNOWFLAKE_USER', 'SNOWFLAKE_PRIVATE_KEY'];

function assertConfigured(env) {
  const missing = REQUIRED_ENV_VARS.filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(`Missing Snowflake env var(s): ${missing.join(', ')}`);
  }
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

const READ_ONLY_RE = /^\s*(select|with|show|describe|desc)\b/i;

function assertReadOnly(sql) {
  if (!READ_ONLY_RE.test(sql)) {
    throw new Error('Only read-only SELECT/WITH/SHOW/DESCRIBE statements are permitted');
  }
  const withoutTrailingSemi = sql.trim().replace(/;+\s*$/, '');
  if (withoutTrailingSemi.includes(';')) {
    throw new Error('Multiple statements are not permitted');
  }
}

export async function snowflakeQuery(env, sql) {
  assertConfigured(env);
  assertReadOnly(sql);
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
        // Cloudflare Workers' fetch() sends no User-Agent by default; Snowflake's
        // SQL API rejects requests with a null/empty one.
        'User-Agent': 'monitor-for-stephen/1.0',
      },
      body: JSON.stringify({
        statement: sql,
        ...(env.SNOWFLAKE_WAREHOUSE ? { warehouse: env.SNOWFLAKE_WAREHOUSE } : {}),
        ...(env.SNOWFLAKE_DATABASE ? { database: env.SNOWFLAKE_DATABASE } : {}),
        ...(env.SNOWFLAKE_SCHEMA ? { schema: env.SNOWFLAKE_SCHEMA } : {}),
        ...(env.SNOWFLAKE_ROLE ? { role: env.SNOWFLAKE_ROLE } : {}),
        timeout: 30,
      }),
    }
  );

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Snowflake query failed (${res.status}): ${json.message || JSON.stringify(json)}`);
  }
  return json;
}
