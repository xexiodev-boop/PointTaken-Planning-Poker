import { JIRA_CHANNEL } from "../../shared/jira.js";
import { api } from "./api.js";

export const JIRA_SCOPES = ["open_sprints", "future_sprints", "backlog", "all_open"];

const SPRINT_FILTERS = {
  open_sprints: "sprint in openSprints()",
  future_sprints: "sprint in futureSprints()",
  backlog: "sprint is EMPTY",
};

export function buildJql(projectKey, scope) {
  const filters = [
    `project = "${projectKey.replaceAll('"', "")}"`,
    "statusCategory != Done",
    SPRINT_FILTERS[scope],
  ].filter(Boolean);
  const order = SPRINT_FILTERS[scope] ? "Rank ASC" : "created DESC";
  return `${filters.join(" AND ")} ORDER BY ${order}`;
}

export function jiraStatus() {
  return api("/api/jira/status");
}

export function jiraProjects(cloudId) {
  return api(`/api/jira/projects?cloudId=${encodeURIComponent(cloudId)}`);
}

export function jiraSearch(cloudId, jql, nextPageToken) {
  return api("/api/jira/search", {
    method: "POST",
    body: JSON.stringify({ cloudId, jql, ...(nextPageToken ? { nextPageToken } : {}) }),
  });
}

export function jiraDisconnect() {
  return api("/api/jira/disconnect", { method: "POST", body: "{}" });
}

// Must run inside the click handler, or the browser blocks the window.
export function openJiraWindow(locale) {
  const width = 560;
  const height = 720;
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
  const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);
  return window.open(
    `/api/jira/connect?lang=${encodeURIComponent(locale)}`,
    "point-taken-jira",
    `popup,width=${width},height=${height},left=${left},top=${top}`,
  );
}

export function onJiraWindowResult(listener) {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(JIRA_CHANNEL);
  channel.addEventListener("message", (event) => listener(event.data));
  return () => channel.close();
}
