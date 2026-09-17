export const JIRA_CHANNEL = "point-taken-jira";
export const JIRA_SEARCH_PAGE_SIZE = 50;

const ISSUE_KEY = /^[A-Z][A-Z0-9_]{0,19}-\d{1,9}$/;
const SITE_HOSTS = [".atlassian.net", ".jira.com"];

export function isIssueKey(value) {
  return typeof value === "string" && ISSUE_KEY.test(value);
}

// Issue links are shown to everyone in the room, so only Atlassian-hosted
// sites are accepted. Returns the bare origin, or null when it does not qualify.
export function jiraSiteOrigin(value) {
  let site;
  try {
    site = new URL(String(value ?? ""));
  } catch {
    return null;
  }
  if (site.protocol !== "https:" || site.port || site.username || site.password) return null;
  if (!SITE_HOSTS.some((suffix) => site.hostname.endsWith(suffix))) return null;
  return site.origin;
}

export function issueUrl(siteOrigin, key) {
  return `${siteOrigin}/browse/${key}`;
}
