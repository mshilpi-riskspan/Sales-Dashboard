import type { Env, SyncResult } from '../types';
import type { SnowflakeClient } from '../snowflake';

const SF_API_VERSION = 'v59.0';

interface SfSession {
  instance_url: string;
  access_token: string;
}

let _session: SfSession | null = null;

async function getSession(env: Env): Promise<SfSession> {
  if (_session) return _session;
  const loginUrl = env.SF_LOGIN_URL.replace(/\/$/, '');
  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:urn="urn:partner.soap.sforce.com">
  <soapenv:Body>
    <urn:login>
      <urn:username>${env.SF_USERNAME}</urn:username>
      <urn:password>${env.SF_PASSWORD}${env.SF_SECURITY_TOKEN}</urn:password>
    </urn:login>
  </soapenv:Body>
</soapenv:Envelope>`;
  const res = await fetch(`${loginUrl}/services/Soap/u/60.0`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml', SOAPAction: 'login' },
    body: soapBody,
  });
  if (!res.ok) throw new Error(`Salesforce SOAP login HTTP error: ${res.status}`);
  const text = await res.text();
  const fault = text.match(/<faultstring>([^<]+)<\/faultstring>/)?.[1];
  if (fault) throw new Error(`Salesforce login fault: ${fault}`);
  const sessionId = text.match(/<sessionId>([^<]+)<\/sessionId>/)?.[1];
  const serverUrl = text.match(/<serverUrl>([^<]+)<\/serverUrl>/)?.[1];
  if (!sessionId || !serverUrl) throw new Error('Salesforce login: missing sessionId or serverUrl');
  const instanceUrl = serverUrl.match(/^(https:\/\/[^/]+)/)?.[1];
  if (!instanceUrl) throw new Error('Could not parse Salesforce instance URL');
  _session = { instance_url: instanceUrl, access_token: sessionId };
  return _session;
}

// Full pagination — for incremental (small datasets only)
async function sfQuery(soql: string, env: Env): Promise<Record<string, unknown>[]> {
  const session = await getSession(env);
  const records: Record<string, unknown>[] = [];
  let url: string | null = `${session.instance_url}/services/data/${SF_API_VERSION}/query?q=${encodeURIComponent(soql)}`;
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${session.access_token}`, Accept: 'application/json', 'Sforce-Query-Options': 'batchSize=2000' },
    });
    if (!res.ok) throw new Error(`Salesforce query error: ${res.status} ${await res.text()}`);
    const data = await res.json() as { records: Record<string, unknown>[]; nextRecordsUrl?: string; done: boolean };
    records.push(...data.records);
    url = data.done ? null : `${session.instance_url}${data.nextRecordsUrl}`;
  }
  return records;
}

function str(v: unknown): string | null { return v != null && v !== '' ? String(v) : null; }
function sfTs(v: unknown): string | null {
  if (!v || typeof v !== 'string') return null;
  return v.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
}
function num(v: unknown): number | null { return v != null && v !== '' ? Number(v) : null; }
function bool(v: unknown): boolean { return v === true || v === 'true'; }
function date(v: unknown): string | null { return v != null && v !== '' ? String(v).slice(0, 10) : null; }

interface TableDef {
  key: string;
  table: string;
  soql: string;
  cols: string[];
  mapRow: (r: Record<string, unknown>, now: string) => unknown[];
}

const TABLES: TableDef[] = [
  {
    key: 'sf_accounts',
    table: 'SF_ACCOUNTS',
    soql: 'SELECT Id, Name, Industry, Type, Website, Phone, Description, BillingCity, BillingState, OwnerId, Owner.Name, AccountType_Tier__c, Current_ARR__c, saasoptics__arr_at_end_of_month__c, Sales_Next_Steps__c, Existing_Connections__c, AnnualRevenue, LastActivityDate, LastModifiedDate FROM Account',
    cols: ['ID','NAME','INDUSTRY','TYPE','WEBSITE','PHONE','DESCRIPTION','BILLING_CITY','BILLING_STATE','OWNER_ID','OWNER_NAME','ACCOUNT_TYPE_TIER','CURRENT_ARR','SAASOPTICS_ARR','SALES_NEXT_STEPS','EXISTING_CONNECTIONS','ANNUAL_REVENUE','LAST_ACTIVITY_DATE','LAST_MODIFIED_DATE','_SYNCED_AT'],
    mapRow: (a, now) => [str(a.Id), str(a.Name), str(a.Industry), str(a.Type), str(a.Website), str(a.Phone), str(a.Description), str(a.BillingCity), str(a.BillingState), str(a.OwnerId), str((a.Owner as Record<string, unknown>)?.Name), str(a.AccountType_Tier__c), num(a.Current_ARR__c), num(a.saasoptics__arr_at_end_of_month__c), str(a.Sales_Next_Steps__c), str(a.Existing_Connections__c), num(a.AnnualRevenue), date(a.LastActivityDate), sfTs(a.LastModifiedDate), now],
  },
  {
    key: 'sf_opportunities',
    table: 'SF_OPPORTUNITIES',
    soql: 'SELECT Id, AccountId, Account.Name, Name, StageName, Amount, Annual_Recurring_Revenue_ARR__c, One_Time_Fees__c, OwnerId, Owner.Name, CreatedDate, LastStageChangeDate, CloseDate, NextStep, ForecastCategory, IsClosed, IsWon, Type, Line_of_Business__c, Primary_Module__c, LeadSource, Description, Loss_Reason__c, Won_Reason__c, LastModifiedDate FROM Opportunity',
    cols: ['ID','ACCOUNT_ID','ACCOUNT_NAME','NAME','STAGE_NAME','AMOUNT','ARR','ONE_TIME_FEES','OWNER_ID','OWNER_NAME','CREATED_DATE','LAST_STAGE_CHANGE_DATE','CLOSE_DATE','NEXT_STEP','FORECAST_CATEGORY','IS_CLOSED','IS_WON','TYPE','LINE_OF_BUSINESS','PRIMARY_MODULE','LEAD_SOURCE','DESCRIPTION','LOSS_REASON','WON_REASON','LAST_MODIFIED_DATE','_SYNCED_AT'],
    mapRow: (o, now) => [str(o.Id), str(o.AccountId), str((o.Account as Record<string, unknown>)?.Name), str(o.Name), str(o.StageName), num(o.Amount), num(o.Annual_Recurring_Revenue_ARR__c), num(o.One_Time_Fees__c), str(o.OwnerId), str((o.Owner as Record<string, unknown>)?.Name), sfTs(o.CreatedDate), sfTs(o.LastStageChangeDate), date(o.CloseDate), str(o.NextStep), str(o.ForecastCategory), bool(o.IsClosed), bool(o.IsWon), str(o.Type), str(o.Line_of_Business__c), str(o.Primary_Module__c), str(o.LeadSource), str(o.Description), str(o.Loss_Reason__c), str(o.Won_Reason__c), sfTs(o.LastModifiedDate), now],
  },
  {
    key: 'sf_contacts',
    table: 'SF_CONTACTS',
    soql: 'SELECT Id, AccountId, FirstName, LastName, Title, Email, Phone, LastActivityDate, LastModifiedDate FROM Contact',
    cols: ['ID','ACCOUNT_ID','FIRST_NAME','LAST_NAME','TITLE','EMAIL','PHONE','LAST_ACTIVITY_DATE','LAST_MODIFIED_DATE','_SYNCED_AT'],
    mapRow: (c, now) => [str(c.Id), str(c.AccountId), str(c.FirstName), str(c.LastName), str(c.Title), str(c.Email), str(c.Phone), date(c.LastActivityDate), sfTs(c.LastModifiedDate), now],
  },
  {
    key: 'sf_tasks',
    table: 'SF_TASKS',
    soql: 'SELECT Id, WhatId, What.Name, OwnerId, Owner.Name, Type, Subject, ActivityDate, CreatedDate, LastModifiedDate, Status, Description FROM Task',
    cols: ['ID','ACCOUNT_ID','ACCOUNT_NAME','OWNER_ID','OWNER_NAME','TYPE','SUBJECT','ACTIVITY_DATE','CREATED_DATE','LAST_MODIFIED_DATE','STATUS','DESCRIPTION','_SYNCED_AT'],
    mapRow: (t, now) => [str(t.Id), str(t.WhatId), str((t.What as Record<string, unknown>)?.Name), str(t.OwnerId), str((t.Owner as Record<string, unknown>)?.Name), str(t.Type), str(t.Subject), date(t.ActivityDate), sfTs(t.CreatedDate), sfTs(t.LastModifiedDate), str(t.Status), str(t.Description), now],
  },
  {
    key: 'sf_events',
    table: 'SF_EVENTS',
    soql: 'SELECT Id, WhatId, What.Name, OwnerId, Owner.Name, Type, Subject, StartDateTime, EndDateTime, LastModifiedDate, Description FROM Event',
    cols: ['ID','ACCOUNT_ID','ACCOUNT_NAME','OWNER_ID','OWNER_NAME','TYPE','SUBJECT','START_DATETIME','END_DATETIME','LAST_MODIFIED_DATE','DESCRIPTION','_SYNCED_AT'],
    mapRow: (e, now) => [str(e.Id), str(e.WhatId), str((e.What as Record<string, unknown>)?.Name), str(e.OwnerId), str((e.Owner as Record<string, unknown>)?.Name), str(e.Type), str(e.Subject), sfTs(e.StartDateTime), sfTs(e.EndDateTime), sfTs(e.LastModifiedDate), str(e.Description), now],
  },
  {
    key: 'sf_campaigns',
    table: 'SF_CAMPAIGNS',
    soql: 'SELECT Id, Name, Type, Status, IsActive, NumberOfLeads, NumberOfContacts, NumberOfOpportunities, NumberOfWonOpportunities, AmountWonOpportunities, Campaign_Industry__c, OwnerId, Owner.Name, LastModifiedDate FROM Campaign',
    cols: ['ID','NAME','TYPE','STATUS','IS_ACTIVE','NUMBER_OF_LEADS','NUMBER_OF_CONTACTS','NUMBER_OF_OPPORTUNITIES','NUMBER_OF_WON_OPPS','AMOUNT_WON_OPPS','CAMPAIGN_INDUSTRY','OWNER_ID','OWNER_NAME','LAST_MODIFIED_DATE','_SYNCED_AT'],
    mapRow: (c, now) => [str(c.Id), str(c.Name), str(c.Type), str(c.Status), bool(c.IsActive), num(c.NumberOfLeads), num(c.NumberOfContacts), num(c.NumberOfOpportunities), num(c.NumberOfWonOpportunities), num(c.AmountWonOpportunities), str(c.Campaign_Industry__c), str(c.OwnerId), str((c.Owner as Record<string, unknown>)?.Name), sfTs(c.LastModifiedDate), now],
  },
];

export async function syncSalesforce(sf: SnowflakeClient, env: Env): Promise<SyncResult[]> {
  const now = new Date().toISOString();

  try { await getSession(env); } catch (e) {
    const err = String(e);
    return TABLES.map(t => ({ source: 'salesforce', table: t.table, upserted: 0, error: err }));
  }

  const settled = await Promise.allSettled(TABLES.map(t => (async (): Promise<SyncResult> => {
    const wm = await env.ETL_KV.get(`watermark:${t.key}`);
    const since = wm ? ` WHERE LastModifiedDate >= ${wm}` : '';
    const records = await sfQuery(`${t.soql}${since} LIMIT 2000`, env);
    const rows = records.map(r => t.mapRow(r, now));
    const n = await sf.mergeRows(t.table, 'ID', t.cols, rows);
    await env.ETL_KV.put(`watermark:${t.key}`, now);
    return { source: 'salesforce', table: t.table, upserted: n };
  })()));

  return settled.map((r, i) =>
    r.status === 'fulfilled' ? r.value :
    { source: 'salesforce', table: TABLES[i].table, upserted: 0, error: String((r as PromiseRejectedResult).reason) }
  );
}
