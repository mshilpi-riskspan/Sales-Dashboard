import type { Env, SyncResult } from '../types';
import type { SnowflakeClient } from '../snowflake';

const SF_API_VERSION = 'v59.0';
const PAGE_SIZE = 2000;

interface SfSession {
  instance_url: string;
  access_token: string;
}

let _session: SfSession | null = null;

async function getSession(env: Env): Promise<SfSession> {
  if (_session) return _session;
  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: 'PlatformCLI',
    username: env.SF_USERNAME,
    password: env.SF_PASSWORD + env.SF_SECURITY_TOKEN,
  });
  const res = await fetch(`${env.SF_LOGIN_URL}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`Salesforce login failed: ${res.status} ${await res.text()}`);
  _session = await res.json() as SfSession;
  return _session;
}

async function sfQuery(soql: string, env: Env): Promise<Record<string, unknown>[]> {
  const session = await getSession(env);
  const records: Record<string, unknown>[] = [];
  let url: string | null = `${session.instance_url}/services/data/${SF_API_VERSION}/query?q=${encodeURIComponent(soql)}`;
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${session.access_token}`, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Salesforce query error: ${res.status} ${await res.text()}`);
    const data = await res.json() as { records: Record<string, unknown>[]; nextRecordsUrl?: string; done: boolean };
    records.push(...data.records);
    url = data.done ? null : `${session.instance_url}${data.nextRecordsUrl}`;
  }
  return records;
}

function str(v: unknown): string | null { return v != null && v !== '' ? String(v) : null; }
function num(v: unknown): number | null { return v != null && v !== '' ? Number(v) : null; }
function bool(v: unknown): boolean { return v === true || v === 'true'; }
function date(v: unknown): string | null { return v != null && v !== '' ? String(v).slice(0, 10) : null; }

export async function syncSalesforce(sf: SnowflakeClient, env: Env): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  const now = new Date().toISOString();

  // Accounts — ALL accounts, no type filter (full reference table for mapping UI)
  try {
    const watermark = await sf.getWatermark('sf_accounts', env.ETL_KV);
    const since = watermark ? ` WHERE LastModifiedDate >= ${watermark}` : '';
    const accounts = await sfQuery(
      `SELECT Id, Name, Industry, Type, Website, Phone, Description, BillingCity, BillingState, OwnerId, Owner.Name, AccountType_Tier__c, Current_ARR__c, saasoptics__arr_at_end_of_month__c, Sales_Next_Steps__c, Existing_Connections__c, AnnualRevenue, LastActivityDate, LastModifiedDate FROM Account${since} LIMIT ${PAGE_SIZE}`,
      env
    );
    const rows = accounts.map(a => [
      str(a.Id),
      str(a.Name),
      str(a.Industry),
      str(a.Type),
      str(a.Website),
      str(a.Phone),
      str(a.Description),
      str(a.BillingCity),
      str(a.BillingState),
      str(a.OwnerId),
      str((a.Owner as Record<string, unknown>)?.Name),
      str(a.AccountType_Tier__c),
      num(a.Current_ARR__c),
      num(a.saasoptics__arr_at_end_of_month__c),
      str(a.Sales_Next_Steps__c),
      str(a.Existing_Connections__c),
      num(a.AnnualRevenue),
      date(a.LastActivityDate),
      str(a.LastModifiedDate),
      now,
    ]);
    const n = await sf.mergeRows('SF_ACCOUNTS', 'ID',
      ['ID', 'NAME', 'INDUSTRY', 'TYPE', 'WEBSITE', 'PHONE', 'DESCRIPTION', 'BILLING_CITY', 'BILLING_STATE', 'OWNER_ID', 'OWNER_NAME', 'ACCOUNT_TYPE_TIER', 'CURRENT_ARR', 'SAASOPTICS_ARR', 'SALES_NEXT_STEPS', 'EXISTING_CONNECTIONS', 'ANNUAL_REVENUE', 'LAST_ACTIVITY_DATE', 'LAST_MODIFIED_DATE', '_SYNCED_AT'],
      rows
    );
    await sf.setWatermark('sf_accounts', now, env.ETL_KV);
    results.push({ source: 'salesforce', table: 'SF_ACCOUNTS', upserted: n });
  } catch (e) {
    results.push({ source: 'salesforce', table: 'SF_ACCOUNTS', upserted: 0, error: String(e) });
  }

  // Opportunities
  try {
    const watermark = await sf.getWatermark('sf_opportunities', env.ETL_KV);
    const since = watermark ? ` WHERE LastModifiedDate >= ${watermark}` : '';
    const opps = await sfQuery(
      `SELECT Id, AccountId, Account.Name, Name, StageName, Amount, Annual_Recurring_Revenue_ARR__c, One_Time_Fees__c, OwnerId, Owner.Name, CreatedDate, Last_Stage_Change_Date__c, CloseDate, NextStep, ForecastCategory, IsClosed, IsWon, Type, Line_of_Business__c, Primary_Module__c, LeadSource, Description, Loss_Reason__c, Loss_Reason_Explanation__c, Won_Reason__c, LastModifiedDate FROM Opportunity${since} LIMIT ${PAGE_SIZE}`,
      env
    );
    const rows = opps.map(o => [
      str(o.Id), str(o.AccountId), str((o.Account as Record<string, unknown>)?.Name), str(o.Name), str(o.StageName),
      num(o.Amount), num(o.Annual_Recurring_Revenue_ARR__c), num(o.One_Time_Fees__c),
      str(o.OwnerId), str((o.Owner as Record<string, unknown>)?.Name),
      str(o.CreatedDate), str(o.Last_Stage_Change_Date__c), date(o.CloseDate),
      str(o.NextStep), str(o.ForecastCategory), bool(o.IsClosed), bool(o.IsWon),
      str(o.Type), str(o.Line_of_Business__c), str(o.Primary_Module__c), str(o.LeadSource),
      str(o.Description), str(o.Loss_Reason__c), str(o.Loss_Reason_Explanation__c), str(o.Won_Reason__c),
      str(o.LastModifiedDate), now,
    ]);
    const n = await sf.mergeRows('SF_OPPORTUNITIES', 'ID',
      ['ID', 'ACCOUNT_ID', 'ACCOUNT_NAME', 'NAME', 'STAGE_NAME', 'AMOUNT', 'ARR', 'ONE_TIME_FEES', 'OWNER_ID', 'OWNER_NAME', 'CREATED_DATE', 'LAST_STAGE_CHANGE_DATE', 'CLOSE_DATE', 'NEXT_STEP', 'FORECAST_CATEGORY', 'IS_CLOSED', 'IS_WON', 'TYPE', 'LINE_OF_BUSINESS', 'PRIMARY_MODULE', 'LEAD_SOURCE', 'DESCRIPTION', 'LOSS_REASON', 'LOSS_REASON_EXPLANATION', 'WON_REASON', 'LAST_MODIFIED_DATE', '_SYNCED_AT'],
      rows
    );
    await sf.setWatermark('sf_opportunities', now, env.ETL_KV);
    results.push({ source: 'salesforce', table: 'SF_OPPORTUNITIES', upserted: n });
  } catch (e) {
    results.push({ source: 'salesforce', table: 'SF_OPPORTUNITIES', upserted: 0, error: String(e) });
  }

  // Contacts
  try {
    const watermark = await sf.getWatermark('sf_contacts', env.ETL_KV);
    const since = watermark ? ` WHERE LastModifiedDate >= ${watermark}` : '';
    const contacts = await sfQuery(
      `SELECT Id, AccountId, FirstName, LastName, Title, Email, Phone, LastActivityDate, LastModifiedDate FROM Contact${since} LIMIT ${PAGE_SIZE}`,
      env
    );
    const rows = contacts.map(c => [str(c.Id), str(c.AccountId), str(c.FirstName), str(c.LastName), str(c.Title), str(c.Email), str(c.Phone), date(c.LastActivityDate), str(c.LastModifiedDate), now]);
    const n = await sf.mergeRows('SF_CONTACTS', 'ID', ['ID', 'ACCOUNT_ID', 'FIRST_NAME', 'LAST_NAME', 'TITLE', 'EMAIL', 'PHONE', 'LAST_ACTIVITY_DATE', 'LAST_MODIFIED_DATE', '_SYNCED_AT'], rows);
    await sf.setWatermark('sf_contacts', now, env.ETL_KV);
    results.push({ source: 'salesforce', table: 'SF_CONTACTS', upserted: n });
  } catch (e) {
    results.push({ source: 'salesforce', table: 'SF_CONTACTS', upserted: 0, error: String(e) });
  }

  // Tasks
  try {
    const watermark = await sf.getWatermark('sf_tasks', env.ETL_KV);
    const since = watermark ? ` WHERE LastModifiedDate >= ${watermark}` : '';
    const tasks = await sfQuery(
      `SELECT Id, WhatId, What.Name, OwnerId, Owner.Name, Type, Subject, ActivityDate, CreatedDate, LastModifiedDate, Status, Description FROM Task${since} LIMIT ${PAGE_SIZE}`,
      env
    );
    const rows = tasks.map(t => [str(t.Id), str(t.WhatId), str((t.What as Record<string, unknown>)?.Name), str(t.OwnerId), str((t.Owner as Record<string, unknown>)?.Name), str(t.Type), str(t.Subject), date(t.ActivityDate), str(t.CreatedDate), str(t.LastModifiedDate), str(t.Status), str(t.Description), now]);
    const n = await sf.mergeRows('SF_TASKS', 'ID', ['ID', 'ACCOUNT_ID', 'ACCOUNT_NAME', 'OWNER_ID', 'OWNER_NAME', 'TYPE', 'SUBJECT', 'ACTIVITY_DATE', 'CREATED_DATE', 'LAST_MODIFIED_DATE', 'STATUS', 'DESCRIPTION', '_SYNCED_AT'], rows);
    await sf.setWatermark('sf_tasks', now, env.ETL_KV);
    results.push({ source: 'salesforce', table: 'SF_TASKS', upserted: n });
  } catch (e) {
    results.push({ source: 'salesforce', table: 'SF_TASKS', upserted: 0, error: String(e) });
  }

  // Events
  try {
    const watermark = await sf.getWatermark('sf_events', env.ETL_KV);
    const since = watermark ? ` WHERE LastModifiedDate >= ${watermark}` : '';
    const events = await sfQuery(
      `SELECT Id, WhatId, What.Name, OwnerId, Owner.Name, Type, Subject, StartDateTime, EndDateTime, LastModifiedDate, Description FROM Event${since} LIMIT ${PAGE_SIZE}`,
      env
    );
    const rows = events.map(e => [str(e.Id), str(e.WhatId), str((e.What as Record<string, unknown>)?.Name), str(e.OwnerId), str((e.Owner as Record<string, unknown>)?.Name), str(e.Type), str(e.Subject), str(e.StartDateTime), str(e.EndDateTime), str(e.LastModifiedDate), str(e.Description), now]);
    const n = await sf.mergeRows('SF_EVENTS', 'ID', ['ID', 'ACCOUNT_ID', 'ACCOUNT_NAME', 'OWNER_ID', 'OWNER_NAME', 'TYPE', 'SUBJECT', 'START_DATETIME', 'END_DATETIME', 'LAST_MODIFIED_DATE', 'DESCRIPTION', '_SYNCED_AT'], rows);
    await sf.setWatermark('sf_events', now, env.ETL_KV);
    results.push({ source: 'salesforce', table: 'SF_EVENTS', upserted: n });
  } catch (e) {
    results.push({ source: 'salesforce', table: 'SF_EVENTS', upserted: 0, error: String(e) });
  }

  // Campaigns
  try {
    const watermark = await sf.getWatermark('sf_campaigns', env.ETL_KV);
    const since = watermark ? ` WHERE LastModifiedDate >= ${watermark}` : '';
    const campaigns = await sfQuery(
      `SELECT Id, Name, Type, Status, IsActive, NumberOfLeads, NumberOfContacts, NumberOfOpportunities, NumberOfWonOpportunities, AmountWonOpportunities, Campaign_Industry__c, OwnerId, Owner.Name, LastModifiedDate FROM Campaign${since} LIMIT ${PAGE_SIZE}`,
      env
    );
    const rows = campaigns.map(c => [str(c.Id), str(c.Name), str(c.Type), str(c.Status), bool(c.IsActive), num(c.NumberOfLeads), num(c.NumberOfContacts), num(c.NumberOfOpportunities), num(c.NumberOfWonOpportunities), num(c.AmountWonOpportunities), str(c.Campaign_Industry__c), str(c.OwnerId), str((c.Owner as Record<string, unknown>)?.Name), str(c.LastModifiedDate), now]);
    const n = await sf.mergeRows('SF_CAMPAIGNS', 'ID', ['ID', 'NAME', 'TYPE', 'STATUS', 'IS_ACTIVE', 'NUMBER_OF_LEADS', 'NUMBER_OF_CONTACTS', 'NUMBER_OF_OPPORTUNITIES', 'NUMBER_OF_WON_OPPS', 'AMOUNT_WON_OPPS', 'CAMPAIGN_INDUSTRY', 'OWNER_ID', 'OWNER_NAME', 'LAST_MODIFIED_DATE', '_SYNCED_AT'], rows);
    await sf.setWatermark('sf_campaigns', now, env.ETL_KV);
    results.push({ source: 'salesforce', table: 'SF_CAMPAIGNS', upserted: n });
  } catch (e) {
    results.push({ source: 'salesforce', table: 'SF_CAMPAIGNS', upserted: 0, error: String(e) });
  }

  return results;
}
