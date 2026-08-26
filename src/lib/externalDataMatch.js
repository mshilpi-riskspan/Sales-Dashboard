// Tiered client-matching helpers for the three live external integrations
// (Freshdesk, Jira, Astronomer) — shared by the bulk Current Clients merge
// (src/lib/currentClientsMerge.js) and the per-account AccountView page, so
// the matching logic lives in exactly one place regardless of which page is
// filtering the same bulk-fetched payload down to one account.
import { looksLikeMatch, normalizeForTagMatch } from './accountMatch';
import { CLIENT_TAG_TO_ACCOUNT_ID } from '../config/clientTagMap';

// Inverted: accountId -> Set<tag> (lowercased) — same ground-truth map
// already proven out for Snowflake DaaS/batch matching, reused verbatim.
const TAGS_BY_ACCOUNT_ID = new Map();
for (const [tag, accountId] of Object.entries(CLIENT_TAG_TO_ACCOUNT_ID)) {
  if (!TAGS_BY_ACCOUNT_ID.has(accountId)) TAGS_BY_ACCOUNT_ID.set(accountId, new Set());
  TAGS_BY_ACCOUNT_ID.get(accountId).add(tag.toLowerCase());
}

export function knownTagsForAccount(accountId) {
  return TAGS_BY_ACCOUNT_ID.get(accountId) || new Set();
}

// ---- Freshdesk ----------------------------------------------------------
// Matching is a three-tier cascade:
// 1. DIM_CLIENT.FRESHDESK_COMPANY_ID direct FK (only ~14 clients have it set)
// 2. Tag-based: Freshdesk uses short uppercase slugs (e.g. "LSEGGROUP",
//    "RITHM-NRZ-CALIBER", "BARINGS-BABSONCAPITAL") not full company names, so
//    fuzzy name matching fails. Instead, check whether the normalised company
//    slug contains (or is contained by) any known client tag for the account —
//    same normalizeForTagMatch() used for Jira/Astronomer.
// 3. Fuzzy name fallback for any client not in the known-tags map.
export function matchFreshdeskTickets({ tickets, companies, freshdeskCompanyId, matchName, knownTags = new Set() }) {
  if (freshdeskCompanyId) {
    const id = Number(freshdeskCompanyId);
    const direct = tickets.filter((t) => t.company_id === id);
    if (direct.length > 0) return direct;
  }
  if (!companies?.length) return [];

  // Tag-based: normalize company slug and check for overlap with known tags
  if (knownTags.size > 0) {
    const tagMatchedIds = new Set(
      companies.filter((c) => {
        const slug = normalizeForTagMatch(c.name);
        for (const tag of knownTags) {
          const t = normalizeForTagMatch(tag);
          if (t && (slug.includes(t) || t.includes(slug))) return true;
        }
        return false;
      }).map((c) => c.id)
    );
    if (tagMatchedIds.size > 0) return tickets.filter((t) => tagMatchedIds.has(t.company_id));
  }

  // Fuzzy name fallback
  if (!matchName) return [];
  const matchedCompanyIds = new Set(
    companies.filter((c) => looksLikeMatch(matchName, c.name)).map((c) => c.id)
  );
  if (matchedCompanyIds.size === 0) return [];
  return tickets.filter((t) => matchedCompanyIds.has(t.company_id));
}

// ---- Jira ----------------------------------------------------------------
// DIM_CLIENT.JIRA_PROJECT_KEY is unpopulated for every client today, so this
// is tag/name matching from the start, not a fallback: known client tag
// against the issue's project name (catches the ~15 dedicated per-client
// projects like "OPS PacLife PretiumProject"), then against labels/summary,
// then a plain fuzzy-match of the account name as a last resort — same
// (LABELS LIKE '%name%' OR SUMMARY LIKE '%name%') shape client-health-app's
// jiraIssuesQuery() uses to find a client's LVL3-project escalations, which
// this fallback was previously missing the labels half of (a client with no
// clientTagMap entry whose only signal was a label, not the project name or
// summary, matched nothing).
export function matchJiraIssues({ issues, knownTags, matchName }) {
  return issues.filter((issue) => {
    const project = issue.fields?.project?.name || '';
    const labels = (issue.fields?.labels || []).join(' ');
    const summary = issue.fields?.summary || '';

    if (knownTags.size > 0) {
      const haystack = `${project} ${labels} ${summary}`.toLowerCase();
      for (const tag of knownTags) {
        if (haystack.includes(tag)) return true;
      }
      return false;
    }
    if (!matchName) return false;
    return looksLikeMatch(matchName, project) || looksLikeMatch(matchName, summary) || looksLikeMatch(matchName, labels);
  });
}

// ---- Astronomer ------------------------------------------------------------
// A DAG's tags array reliably includes the exact client tag alongside
// descriptive tags (e.g. ["abcarval", "abcarval_master_adhoc", "daas_api_triggered",
// "live_dag", "raas"]) — checking tag membership against the known set is
// simpler and more robust than trying to skip-list the descriptive ones.
export function matchAstroDags({ dags, runsByDagId, knownTags, matchName }) {
  const matched = dags.filter((dag) => {
    const tagNames = (dag.tags || []).map((t) => (t.name || '').toLowerCase());
    if (knownTags.size > 0) {
      return tagNames.some((t) => knownTags.has(t));
    }
    if (!matchName) return false;
    const fallbackTag = normalizeForTagMatch(matchName);
    if (!fallbackTag) return false;
    return normalizeForTagMatch(dag.dag_id).includes(fallbackTag)
      || tagNames.some((t) => normalizeForTagMatch(t).includes(fallbackTag));
  });

  return matched.map((dag) => ({ ...dag, runs: runsByDagId?.[dag.dag_id] || [] }));
}

// ---- Maxio (SaaSOptics) ----------------------------------------------------
// Primary: customer.sf_id === Salesforce Account.Id — well-populated in this
// org (unlike Freshdesk's company FK), so this is a direct match for most
// customers. Fallback: fuzzy-match the customer/billing-profile name.
export function matchMaxioCustomers({ customers, accountId, matchName }) {
  const direct = customers.filter((c) => c.sf_id === accountId);
  if (direct.length > 0) return direct;
  if (!matchName) return [];
  return customers.filter(
    (c) => looksLikeMatch(matchName, c.name) || looksLikeMatch(matchName, c.billing_profile?.company_name)
  );
}

// ARR lives on /transactions (the actual subscription line items), not on
// /contracts — each transaction has home_arr_amount, start_date/end_date
// (the renewal date), and a cancelled flag. ARR = sum of home_arr_amount
// across currently-active (not cancelled, start_date <= today <= end_date)
// transactions; `lines` includes every transaction — active, expired, and
// cancelled — so a drill-down panel can show full contract history, not
// just what's active right now.
export function buildMaxioBilling({ customers, contracts, transactions, items, accountId, matchName }) {
  const matchedCustomers = matchMaxioCustomers({ customers, accountId, matchName });
  const customerIds = new Set(matchedCustomers.map((c) => c.id));
  const contractIds = new Set(contracts.filter((c) => customerIds.has(c.customer)).map((c) => c.id));
  const itemNameById = new Map(items.map((i) => [i.id, i.name]));

  const today = new Date().toISOString().slice(0, 10);
  const lines = transactions
    .filter((t) => contractIds.has(t.contract))
    .map((t) => ({
      ...t,
      itemName: itemNameById.get(t.item) || null,
      isActive: !t.cancelled && !!t.start_date && t.start_date <= today && (!t.end_date || t.end_date >= today),
    }))
    .sort((a, b) => (b.end_date || '').localeCompare(a.end_date || ''));

  // When a client renews early, Maxio creates a new line (later start_date)
  // while the old line is still technically active (end_date >= today).
  // Keep only the newest start_date per item so the superseded term doesn't
  // double-count ARR or pull the nextRenewalDate back to the old end_date.
  const allActive = lines.filter((l) => l.isActive);
  const newestByItem = new Map();
  for (const l of allActive) {
    const key = l.item ?? l.itemName ?? l.id;
    const existing = newestByItem.get(key);
    if (!existing || (l.start_date || '') > (existing.start_date || '')) {
      newestByItem.set(key, l);
    }
  }
  const activeLines = Array.from(newestByItem.values());

  const arr = activeLines.reduce((sum, l) => sum + (Number(l.home_arr_amount) || 0), 0);
  const nextRenewalDate = activeLines.reduce((min, l) => (l.end_date && (!min || l.end_date < min) ? l.end_date : min), null);

  return { matchedCustomers, arr, nextRenewalDate, lines };
}

// Replays buildMaxioBilling's same "isActive" test (start_date <= X <=
// end_date, not cancelled) at each historical month-end instead of just
// "today", to chart how ARR has grown/shrunk over time. Caveat: a cancelled
// line has no cancellation date in this data — it's either fully in or
// fully out of its whole start_date-end_date span, so a mid-span
// cancellation shows as ARR dropping at that line's original end_date, not
// the actual cancellation date.
export function buildMaxioArrSeries(lines, months = 24) {
  const now = new Date();
  const series = [];
  for (let i = months - 1; i >= 0; i--) {
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const cutoff = monthEnd.toISOString().slice(0, 10);
    const arr = lines
      .filter((l) => !l.cancelled && l.start_date && l.start_date <= cutoff && (!l.end_date || l.end_date >= cutoff))
      .reduce((sum, l) => sum + (Number(l.home_arr_amount) || 0), 0);
    series.push({ label: monthEnd.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), arr });
  }
  return series;
}
