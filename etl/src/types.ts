export interface Env {
  // KV namespace for watermarks
  ETL_KV: KVNamespace;

  // Snowflake (vars — not secret)
  SNOWFLAKE_DATABASE: string;
  SNOWFLAKE_SCHEMA: string;
  SNOWFLAKE_ROLE: string;

  // Snowflake (secrets)
  SNOWFLAKE_ACCOUNT: string;
  SNOWFLAKE_USER: string;
  SNOWFLAKE_PRIVATE_KEY: string;
  SNOWFLAKE_WAREHOUSE: string;

  // Freshdesk
  FRESHDESK_API_KEY: string;
  FRESHDESK_DOMAIN: string;

  // Jira
  JIRA_BASE_URL: string;
  JIRA_USERNAME: string;
  JIRA_API_TOKEN: string;

  // Maxio
  MAXIO_API_TOKEN: string;
  MAXIO_BASE_URL: string;

  // Salesforce
  SF_LOGIN_URL: string;
  SF_USERNAME: string;
  SF_PASSWORD: string;
  SF_SECURITY_TOKEN: string;

  // Astronomer
  ASTRO_API_TOKEN: string;
  ASTRO_BASE_URL: string;
}

export interface SyncResult {
  source: string;
  table: string;
  upserted: number;
  error?: string;
}
