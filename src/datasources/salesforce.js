// Salesforce data source — SOAP login (no Connected App required)
// All queries proxied through /sf-api to avoid CORS in dev

let sessionId = null;
let instanceUrl = null;

const cache = new Map(); // key: SOQL string, value: { data, timestamp }
const CACHE_TTL = 5 * 60 * 1000;

function isCacheValid(entry) {
  return entry && Date.now() - entry.timestamp < CACHE_TTL;
}

export function invalidateCache() {
  cache.clear();
}

async function login() {
  const username = import.meta.env.VITE_SF_USERNAME;
  const password = import.meta.env.VITE_SF_PASSWORD + import.meta.env.VITE_SF_SECURITY_TOKEN;

  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:urn="urn:partner.soap.sforce.com">
  <soapenv:Body>
    <urn:login>
      <urn:username>${username}</urn:username>
      <urn:password>${password}</urn:password>
    </urn:login>
  </soapenv:Body>
</soapenv:Envelope>`;

  // /sf-auth proxies to login.salesforce.com (static proxy — see vite.config.js)
  const res = await fetch('/sf-auth/services/Soap/u/60.0', {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml',
      SOAPAction: 'login',
    },
    body: soapBody,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SF auth failed (${res.status}): ${text.substring(0, 200)}`);
  }

  const text = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');

  const fault = doc.querySelector('faultstring');
  if (fault) throw new Error(`SF login fault: ${fault.textContent}`);

  const sid = doc.querySelector('sessionId');
  const serverUrl = doc.querySelector('serverUrl');

  if (!sid || !serverUrl) throw new Error('SF login response missing sessionId or serverUrl');

  sessionId = sid.textContent;

  // serverUrl is like https://na123.salesforce.com/services/Soap/u/60.0 — extract origin
  const match = serverUrl.textContent.match(/^(https:\/\/[^/]+)/);
  if (!match) throw new Error('Could not parse instance URL from SF login response');
  instanceUrl = match[1];

  // Register instance URL with the Vite dev proxy so /sf-api requests route correctly
  try {
    await fetch('/sf-instance-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: instanceUrl }),
    });
  } catch {
    // In production builds the endpoint won't exist; CORS must be configured on SF side
  }
}

async function getSession() {
  if (!sessionId) await login();
  return { sessionId, instanceUrl };
}

function clearSession() {
  sessionId = null;
  instanceUrl = null;
}

async function queryPage(soql, url = null) {
  const { sessionId: sid, instanceUrl: base } = await getSession();
  const endpoint = url || `${base}/services/data/v60.0/query/?q=${encodeURIComponent(soql)}`;

  // Route through proxy: strip base URL and prefix with /sf-api
  const proxied = endpoint.replace(/^https:\/\/[^/]+/, '/sf-api');

  const res = await fetch(proxied, {
    headers: { Authorization: `Bearer ${sid}` },
  });

  if (res.status === 401) {
    clearSession();
    throw new Error('SF session expired — please refresh');
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SF query failed (${res.status}): ${body.substring(0, 200)}`);
  }

  return res.json();
}

// Fetches all pages, following nextRecordsUrl
async function queryAll(soql) {
  const cached = cache.get(soql);
  if (isCacheValid(cached)) return cached.data;

  let records = [];
  let result = await queryPage(soql);
  records = records.concat(result.records || []);

  while (!result.done && result.nextRecordsUrl) {
    result = await queryPage(null, result.nextRecordsUrl.replace(/^\//, `${instanceUrl}/`));
    records = records.concat(result.records || []);
  }

  cache.set(soql, { data: records, timestamp: Date.now() });
  return records;
}

// ─── Named query functions ──────────────────────────────────────────────────

export async function fetchOpenOpportunities() {
  return queryAll(
    `SELECT Id, Name, StageName, Amount, Annual_Recurring_Revenue_ARR__c, OwnerId, Owner.Name,
     AccountId, Account.Name, CreatedDate, LastStageChangeDate, CloseDate, NextStep,
     ForecastCategoryName, IsClosed, IsWon
     FROM Opportunity
     WHERE (IsClosed = false OR (IsWon = true AND CloseDate = THIS_YEAR))
     AND StageName != 'Client Prospecting'
     ORDER BY CreatedDate DESC`
  );
}

export async function fetchTasksThisQuarter() {
  // LIMIT caps pagination — enough for meaningful activity metrics
  return queryAll(
    `SELECT Id, WhoId, WhatId, What.Name, OwnerId, Owner.Name, Type, Subject, ActivityDate, CreatedDate, Status, Description
     FROM Task
     WHERE CreatedDate = THIS_QUARTER
     ORDER BY CreatedDate DESC
     LIMIT 5000`
  );
}

export async function fetchEventsThisQuarter() {
  return queryAll(
    `SELECT Id, WhatId, What.Name, OwnerId, Owner.Name, Type, Subject, StartDateTime, EndDateTime, Description
     FROM Event
     WHERE StartDateTime = THIS_QUARTER
     ORDER BY StartDateTime DESC
     LIMIT 2000`
  );
}

export async function fetchAccountDetail(accountId) {
  const cacheKey = `account:${accountId}`;
  const cached = cache.get(cacheKey);
  if (isCacheValid(cached)) return cached.data;

  const { sessionId: sid, instanceUrl: base } = await getSession();
  const soql = `SELECT Id, Name, Industry, Type, Website, Phone, Description, AnnualRevenue, BillingCity, BillingState, OwnerId, Owner.Name FROM Account WHERE Id = '${accountId}'`;
  const proxied = `${base}/services/data/v60.0/query/?q=${encodeURIComponent(soql)}`.replace(/^https:\/\/[^/]+/, '/sf-api');

  const res = await fetch(proxied, { headers: { Authorization: `Bearer ${sid}` } });
  if (!res.ok) return null;
  const json = await res.json();
  const record = json.records?.[0] ?? null;
  cache.set(cacheKey, { data: record, timestamp: Date.now() });
  return record;
}

export async function fetchAccountActivities(accountId) {
  const cacheKey = `activities:${accountId}`;
  const cached = cache.get(cacheKey);
  if (isCacheValid(cached)) return cached.data;

  const { sessionId: sid, instanceUrl: base } = await getSession();

  async function run(soql) {
    const proxied = `${base}/services/data/v60.0/query/?q=${encodeURIComponent(soql)}`.replace(/^https:\/\/[^/]+/, '/sf-api');
    const res = await fetch(proxied, { headers: { Authorization: `Bearer ${sid}` } });
    if (!res.ok) return [];
    const json = await res.json();
    return json.records || [];
  }

  const [tasks, events] = await Promise.all([
    run(`SELECT Id, Subject, Type, ActivityDate, Status, OwnerId, Owner.Name, Description FROM Task WHERE WhatId = '${accountId}' AND ActivityDate = THIS_YEAR ORDER BY ActivityDate DESC NULLS LAST LIMIT 100`),
    run(`SELECT Id, Subject, Type, StartDateTime, OwnerId, Owner.Name, Description FROM Event WHERE WhatId = '${accountId}' AND StartDateTime = THIS_YEAR ORDER BY StartDateTime DESC LIMIT 50`),
  ]);

  const result = { tasks, events };
  cache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}

export async function fetchAccountContacts(accountId) {
  const cacheKey = `contacts:${accountId}`;
  const cached = cache.get(cacheKey);
  if (isCacheValid(cached)) return cached.data;

  const { sessionId: sid, instanceUrl: base } = await getSession();
  const soql = `SELECT Id, FirstName, LastName, Title, Email, Phone, LastActivityDate FROM Contact WHERE AccountId = '${accountId}' ORDER BY LastActivityDate DESC NULLS LAST LIMIT 25`;
  const proxied = `${base}/services/data/v60.0/query/?q=${encodeURIComponent(soql)}`.replace(/^https:\/\/[^/]+/, '/sf-api');

  const res = await fetch(proxied, { headers: { Authorization: `Bearer ${sid}` } });
  if (!res.ok) return [];
  const json = await res.json();
  const records = json.records || [];
  cache.set(cacheKey, { data: records, timestamp: Date.now() });
  return records;
}

export async function fetchOppsThisQuarter() {
  return queryAll(
    `SELECT Id, Name, StageName, Amount, Annual_Recurring_Revenue_ARR__c, OwnerId, Owner.Name,
     AccountId, Account.Name, CreatedDate, CloseDate, IsClosed, IsWon, LeadSource,
     Description, ForecastCategoryName
     FROM Opportunity
     WHERE CreatedDate = THIS_QUARTER
     ORDER BY CreatedDate DESC`
  );
}

export async function fetchOppsYTD() {
  const year = new Date().getFullYear();
  return queryAll(
    `SELECT Id, OwnerId, Owner.Name, Annual_Recurring_Revenue_ARR__c, Amount, IsWon, IsClosed,
     CloseDate, Description, ForecastCategoryName
     FROM Opportunity
     WHERE IsWon = true
     AND CloseDate >= ${year}-01-01`
  );
}

export async function fetchOpportunityHistory(oppId) {
  const cacheKey = `opp:history:${oppId}`;
  const cached = cache.get(cacheKey);
  if (isCacheValid(cached)) return cached.data;

  const { sessionId: sid, instanceUrl: base } = await getSession();
  const soql = `SELECT StageName, CreatedDate FROM OpportunityHistory WHERE OpportunityId = '${oppId}' ORDER BY CreatedDate ASC`;
  const proxied = `${base}/services/data/v60.0/query/?q=${encodeURIComponent(soql)}`.replace(/^https:\/\/[^/]+/, '/sf-api');

  const res = await fetch(proxied, { headers: { Authorization: `Bearer ${sid}` } });
  if (!res.ok) return [];
  const json = await res.json();
  const records = json.records || [];
  cache.set(cacheKey, { data: records, timestamp: Date.now() });
  return records;
}

export async function fetchCampaigns() {
  return queryAll(
    `SELECT Id, Name, Type, Status, IsActive, NumberOfLeads, NumberOfContacts,
     NumberOfOpportunities, NumberOfWonOpportunities, AmountWonOpportunities,
     Campaign_Industry__c, OwnerId, Owner.Name, LastModifiedDate
     FROM Campaign
     ORDER BY IsActive DESC, LastModifiedDate DESC
     LIMIT 500`
  );
}

export async function fetchCampaignStatuses(campaignId) {
  const cacheKey = `campaign:statuses:${campaignId}`;
  const cached = cache.get(cacheKey);
  if (isCacheValid(cached)) return cached.data;

  const { sessionId: sid, instanceUrl: base } = await getSession();
  const soql = `SELECT Id, Label, IsDefault, HasResponded, SortOrder FROM CampaignMemberStatus WHERE CampaignId = '${campaignId}' ORDER BY SortOrder ASC`;
  const proxied = `${base}/services/data/v60.0/query/?q=${encodeURIComponent(soql)}`.replace(/^https:\/\/[^/]+/, '/sf-api');

  const res = await fetch(proxied, { headers: { Authorization: `Bearer ${sid}` } });
  if (!res.ok) return [];
  const json = await res.json();
  const records = json.records || [];
  cache.set(cacheKey, { data: records, timestamp: Date.now() });
  return records;
}

export async function fetchCampaignMembers(campaignId) {
  const cacheKey = `campaign:members:${campaignId}`;
  const cached = cache.get(cacheKey);
  if (isCacheValid(cached)) return cached.data;

  const { sessionId: sid, instanceUrl: base } = await getSession();
  const soql = `SELECT Id, Name, FirstName, LastName, Title, Status, HasResponded,
    ContactId, Contact.Name, Contact.Title, Contact.AccountId, LeadId, Lead.Name, Lead.Company,
    CompanyOrAccount, Type, Email, CreatedDate, FirstRespondedDate
    FROM CampaignMember WHERE CampaignId = '${campaignId}' ORDER BY Status ASC LIMIT 2000`;
  const proxied = `${base}/services/data/v60.0/query/?q=${encodeURIComponent(soql)}`.replace(/^https:\/\/[^/]+/, '/sf-api');

  let records = [];
  let result = await (await fetch(proxied, { headers: { Authorization: `Bearer ${sid}` } })).json();
  records = records.concat(result.records || []);
  while (!result.done && result.nextRecordsUrl) {
    const next = result.nextRecordsUrl.replace(/^\//, `${base}/`).replace(/^https:\/\/[^/]+/, '/sf-api');
    result = await (await fetch(next, { headers: { Authorization: `Bearer ${sid}` } })).json();
    records = records.concat(result.records || []);
  }

  cache.set(cacheKey, { data: records, timestamp: Date.now() });
  return records;
}

export async function fetchCampaignOpportunities(campaignId) {
  const cacheKey = `campaign:opps:${campaignId}`;
  const cached = cache.get(cacheKey);
  if (isCacheValid(cached)) return cached.data;

  const { sessionId: sid, instanceUrl: base } = await getSession();
  const soql = `SELECT Id, Name, StageName, Annual_Recurring_Revenue_ARR__c, Amount,
    AccountId, Account.Name, IsClosed, IsWon, CloseDate, CreatedDate, LastStageChangeDate,
    OwnerId, Owner.Name
    FROM Opportunity WHERE CampaignId = '${campaignId}' ORDER BY CreatedDate DESC`;
  const proxied = `${base}/services/data/v60.0/query/?q=${encodeURIComponent(soql)}`.replace(/^https:\/\/[^/]+/, '/sf-api');

  const res = await fetch(proxied, { headers: { Authorization: `Bearer ${sid}` } });
  if (!res.ok) return [];
  const json = await res.json();
  const records = json.records || [];
  cache.set(cacheKey, { data: records, timestamp: Date.now() });
  return records;
}

export async function fetchClosedOppsInYear(year) {
  const cacheKey = `opps:closed:${year}`;
  const cached = cache.get(cacheKey);
  if (isCacheValid(cached)) return cached.data;

  return queryAll(
    `SELECT Id, Name, StageName, Amount, Annual_Recurring_Revenue_ARR__c, OwnerId, Owner.Name,
     AccountId, Account.Name, CreatedDate, CloseDate, IsClosed, IsWon,
     LeadSource, Description, ForecastCategoryName,
     Loss_Reason__c, Closed_Lost_Reason_Explanation__c, Won_Reason__c
     FROM Opportunity
     WHERE IsClosed = true
     AND CloseDate >= ${year}-01-01 AND CloseDate <= ${year}-12-31
     ORDER BY CloseDate DESC`
  );
}

export async function fetchOpportunitiesClosingInYear(year) {
  const cacheKey = `opps:closing:${year}`;
  const cached = cache.get(cacheKey);
  if (isCacheValid(cached)) return cached.data;

  return queryAll(
    `SELECT Id, Name, StageName, Amount, Annual_Recurring_Revenue_ARR__c, OwnerId, Owner.Name,
     AccountId, Account.Name, CreatedDate, LastStageChangeDate, CloseDate, NextStep,
     ForecastCategoryName, IsClosed, IsWon
     FROM Opportunity
     WHERE CloseDate >= ${year}-01-01 AND CloseDate <= ${year}-12-31
     AND IsClosed = false
     AND StageName != 'Client Prospecting'
     ORDER BY CloseDate ASC`
  );
}

export async function fetchAllReps() {
  // Only include reps who own at least one open opportunity (same filter as fetchOpenOpportunities)
  const opps = await queryAll(
    `SELECT OwnerId, Owner.Name FROM Opportunity
     WHERE (IsClosed = false OR (IsWon = true AND CloseDate = THIS_YEAR))
     AND StageName != 'Client Prospecting'
     ORDER BY Owner.Name ASC`
  );

  const seen = new Map();
  for (const o of opps) {
    if (o.OwnerId && !seen.has(o.OwnerId)) {
      seen.set(o.OwnerId, o.Owner?.Name || o.OwnerId);
    }
  }

  return Array.from(seen.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
