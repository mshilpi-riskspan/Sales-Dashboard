import type { Env } from './types';

// Wrap any JSON-serialisable value that maps to a VARIANT column
export class JsonVariant {
  constructor(public readonly value: unknown) {}
}

interface SnowflakeResponse {
  resultSetMetaData?: { rowType: { name: string }[] };
  data?: string[][];
  message?: string;
  code?: string;
}

export class SnowflakeClient {
  private account: string;
  private user: string;
  private privateKey: string;
  private warehouse: string;
  private database: string;
  private schema: string;
  private role: string;
  private _cachedJwt: string | null = null; // reuse within one invocation — RSA sign is expensive

  constructor(env: Env) {
    this.account = env.SNOWFLAKE_ACCOUNT;
    this.user = env.SNOWFLAKE_USER;
    this.privateKey = env.SNOWFLAKE_PRIVATE_KEY;
    this.warehouse = env.SNOWFLAKE_WAREHOUSE;
    this.database = env.SNOWFLAKE_DATABASE;
    this.schema = env.SNOWFLAKE_SCHEMA;
    this.role = env.SNOWFLAKE_ROLE;
  }

  private normalizePem(raw: string): string {
    return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
  }

  private pemToDer(pem: string): Uint8Array {
    const body = pem.replace(/-----BEGIN [^-]+-----/, '').replace(/-----END [^-]+-----/, '').replace(/\s+/g, '');
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  private b64(buf: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }

  private async getFingerprint(pem: string): Promise<string> {
    const der = this.pemToDer(pem);
    const pk = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, ['sign']);
    const jwk = await crypto.subtle.exportKey('jwk', pk) as JsonWebKey;
    const pub = await crypto.subtle.importKey('jwk', { kty: jwk.kty!, n: jwk.n!, e: jwk.e! }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, true, ['verify']);
    const spki = await crypto.subtle.exportKey('spki', pub) as ArrayBuffer;
    const digest = await crypto.subtle.digest('SHA-256', spki);
    return `SHA256:${this.b64(digest)}`;
  }

  private async signJwt(payload: Record<string, unknown>, header: Record<string, string>): Promise<string> {
    const pem = this.normalizePem(this.privateKey);
    const der = this.pemToDer(pem);
    const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);

    const encode = (obj: unknown) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const headerB64 = encode(header);
    const payloadB64 = encode(payload);
    const msg = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, msg);
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    return `${headerB64}.${payloadB64}.${sigB64}`;
  }

  async getJwt(): Promise<string> {
    if (this._cachedJwt) return this._cachedJwt;
    const pem = this.normalizePem(this.privateKey);
    const acct = this.account.toUpperCase();
    const user = this.user.toUpperCase();
    const fp = await this.getFingerprint(pem);
    const now = Math.floor(Date.now() / 1000);
    this._cachedJwt = await this.signJwt(
      { iss: `${acct}.${user}.${fp}`, sub: `${acct}.${user}`, iat: now, exp: now + 3600 },
      { alg: 'RS256', typ: 'JWT' }
    );
    return this._cachedJwt;
  }

  async execute(statement: string): Promise<{ columns: string[]; rows: string[][] }> {
    const jwt = await this.getJwt();
    const res = await fetch(
      `https://${this.account}.snowflakecomputing.com/api/v2/statements?async=false`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
          'X-Snowflake-Authorization-Token-Type': 'KEYPAIR_JWT',
          Accept: 'application/json',
          'User-Agent': 'riskspan-dashboard-etl/1.0',
        },
        body: JSON.stringify({
          statement,
          warehouse: this.warehouse,
          database: this.database,
          schema: this.schema,
          role: this.role,
          timeout: 120,
        }),
      }
    );
    const json = await res.json() as SnowflakeResponse;
    if (!res.ok) throw new Error(`Snowflake error (${res.status}): ${json.message || JSON.stringify(json)}`);
    const columns = json.resultSetMetaData?.rowType?.map(c => c.name) ?? [];
    return { columns, rows: json.data ?? [] };
  }

  async mergeRows(table: string, idCol: string, cols: string[], rows: (string | number | boolean | null | JsonVariant)[][]): Promise<number> {
    if (rows.length === 0) return 0;
    const BATCH = 100;
    let total = 0;
    // Plain scalar for VALUES clause (no function calls allowed there)
    const fmtVal = (v: unknown): string => {
      if (v === null || v === undefined) return 'NULL';
      if (v instanceof JsonVariant) return v.value == null ? 'NULL' : `'${JSON.stringify(v.value).replace(/'/g, "''")}'`;
      if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
      return String(v); // number | boolean
    };
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      // Detect which column indexes hold VARIANT (JsonVariant) values
      const variantCols = new Set<number>();
      for (const row of batch) {
        row.forEach((v, idx) => { if (v instanceof JsonVariant) variantCols.add(idx); });
      }
      const values = batch.map(r => `(${r.map(fmtVal).join(', ')})`).join(',\n');
      // For VARIANT cols, wrap the positional ref with PARSE_JSON in SELECT
      const selectCols = cols.map((c, idx) =>
        variantCols.has(idx) ? `PARSE_JSON($${idx + 1}) AS ${c}` : `$${idx + 1} AS ${c}`
      ).join(', ');
      const setClauses = cols.filter(c => c !== idCol).map(c => `t.${c} = s.${c}`).join(', ');
      const sql = `
        MERGE INTO ${table} AS t
        USING (SELECT ${selectCols} FROM VALUES ${values}) AS s
        ON t.${idCol} = s.${idCol}
        WHEN MATCHED THEN UPDATE SET ${setClauses}
        WHEN NOT MATCHED THEN INSERT (${cols.join(', ')}) VALUES (${cols.map(c => `s.${c}`).join(', ')})
      `;
      await this.execute(sql);
      total += batch.length;
    }
    return total;
  }

  async getWatermark(key: string, kv: KVNamespace): Promise<string | null> {
    return kv.get(`watermark:${key}`);
  }

  async setWatermark(key: string, value: string, kv: KVNamespace): Promise<void> {
    await kv.put(`watermark:${key}`, value);
  }
}
