import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ROOM_LIMITS } from "../../../shared/limits.js";
import {
  buildJql,
  JIRA_SCOPES,
  jiraDisconnect,
  jiraProjects,
  jiraSearch,
  jiraStatus,
  onJiraWindowResult,
  openJiraWindow,
} from "../../lib/jira.js";

const DEFAULT_SCOPE = "backlog";
// Keeps each add_items message well under the 16 KB socket limit.
const IMPORT_BATCH = 20;
const OFFLINE = { available: false, connected: false, sites: [] };

export function JiraImport({ room, send }) {
  const { t, i18n } = useLingui();
  const [status, setStatus] = useState(null);
  const [siteId, setSiteId] = useState("");
  const [projects, setProjects] = useState([]);
  const [projectKey, setProjectKey] = useState("");
  const [scope, setScope] = useState(DEFAULT_SCOPE);
  const [jql, setJql] = useState("");
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [connectFailed, setConnectFailed] = useState(false);

  const pendingItems = useMemo(
    () => room.items.filter((item) => item.status === "pending"),
    [room.items],
  );
  const queuedKeys = useMemo(
    () => new Set(pendingItems.map((item) => item.key).filter(Boolean)),
    [pendingItems],
  );
  const slotsLeft = ROOM_LIMITS.pendingItems - pendingItems.length;
  const site = status?.sites.find(({ id }) => id === siteId) ?? null;
  const scopeLabels = {
    open_sprints: t`Active sprint`,
    future_sprints: t`Upcoming sprints`,
    backlog: t`Backlog (no sprint)`,
    all_open: t`All open issues`,
  };

  const refresh = useCallback(async () => {
    const next = await jiraStatus().catch(() => OFFLINE);
    setStatus(next);
    setSiteId((current) => (next.sites.some(({ id }) => id === current) ? current : next.sites[0]?.id ?? ""));
    if (next.connected) setConnectFailed(false);
  }, []);

  useEffect(() => {
    refresh();
    return onJiraWindowResult((result) => {
      setConnectFailed(result !== "connected");
      refresh();
    });
  }, [refresh]);

  // Fallback for browsers where the sign-in window cannot report back.
  const waitingForSignIn = Boolean(status?.available && !status.connected);
  useEffect(() => {
    if (!waitingForSignIn) return undefined;
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh, waitingForSignIn]);

  const fail = useCallback((error) => {
    if (error.status === 401) refresh();
    setProblem(error.message);
  }, [refresh]);

  useEffect(() => {
    if (!siteId) return undefined;
    let stale = false;
    jiraProjects(siteId)
      .then(({ projects: found }) => {
        if (stale) return;
        const first = found[0]?.key ?? "";
        setProjects(found);
        setProjectKey(first);
        setJql(first ? buildJql(first, DEFAULT_SCOPE) : "");
        setScope(DEFAULT_SCOPE);
        setResults(null);
      })
      .catch((error) => {
        if (!stale) fail(error);
      });
    return () => {
      stale = true;
    };
  }, [fail, siteId]);

  function connect() {
    setProblem("");
    setConnectFailed(false);
    if (!openJiraWindow(i18n.locale)) {
      setProblem(t`Your browser blocked the Jira window. Allow pop-ups for this site and try again.`);
    }
  }

  async function disconnect() {
    await jiraDisconnect().catch(() => {});
    setResults(null);
    setProblem("");
    refresh();
  }

  function chooseProject(key) {
    setProjectKey(key);
    setJql(buildJql(key, scope));
  }

  function chooseScope(next) {
    setScope(next);
    if (projectKey) setJql(buildJql(projectKey, next));
  }

  async function runSearch(event) {
    event.preventDefault();
    setBusy(true);
    setProblem("");
    try {
      const found = await jiraSearch(siteId, jql);
      setResults({ ...found, jql });
      setSelected(new Set(
        found.issues.filter(({ key }) => !queuedKeys.has(key)).slice(0, Math.max(slotsLeft, 0)).map(({ key }) => key),
      ));
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  async function loadMore() {
    setBusy(true);
    try {
      const more = await jiraSearch(siteId, results.jql, results.nextPageToken);
      setResults((current) => ({
        ...current,
        issues: [...current.issues, ...more.issues.filter(({ key }) => !current.issues.some((issue) => issue.key === key))],
        nextPageToken: more.nextPageToken,
      }));
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  function toggle(key) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  function importSelected() {
    const chosen = results.issues
      .filter(({ key }) => selected.has(key) && !queuedKeys.has(key))
      .map(({ key, title }) => ({ key, title }));
    for (let index = 0; index < chosen.length; index += IMPORT_BATCH) {
      send({ type: "add_items", items: chosen.slice(index, index + IMPORT_BATCH), siteUrl: site.url });
    }
    setResults(null);
    setSelected(new Set());
  }

  if (!status?.available) return null;

  const selectedCount = results
    ? results.issues.filter(({ key }) => selected.has(key) && !queuedKeys.has(key)).length
    : 0;

  return (
    <section className="jira-import" aria-labelledby="jira-import-title">
      <div className="jira-import-heading">
        <h3 id="jira-import-title"><Trans>Import from Jira</Trans></h3>
        {status.connected && (
          <button className="text-button" onClick={disconnect} type="button"><Trans>Disconnect</Trans></button>
        )}
      </div>

      {!status.connected && (
        <>
          <p>
            <Trans>
              Sign in with Atlassian to pull issues straight into the queue. Access is read-only, lasts
              about an hour, and stays in this browser.
            </Trans>
          </p>
          <button className="secondary-button" onClick={connect} type="button"><Trans>Connect Jira</Trans></button>
          {connectFailed && <p className="jira-problem" role="alert"><Trans>Jira was not connected. Try again.</Trans></p>}
        </>
      )}

      {status.connected && !status.sites.length && (
        <p><Trans>This Atlassian account has no Jira site that Point Taken was given access to.</Trans></p>
      )}

      {status.connected && site && (
        <form onSubmit={runSearch}>
          {status.sites.length > 1 && (
            <label>
              <Trans>Site</Trans>
              <select onChange={(event) => setSiteId(event.target.value)} value={siteId}>
                {status.sites.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
          )}
          <div className="jira-filters">
            <label>
              <Trans>Project</Trans>
              <select
                disabled={!projects.length}
                onChange={(event) => chooseProject(event.target.value)}
                value={projectKey}
              >
                {projects.map(({ key, name }) => <option key={key} value={key}>{name} ({key})</option>)}
              </select>
            </label>
            <label>
              <Trans>Issues from</Trans>
              <select onChange={(event) => chooseScope(event.target.value)} value={scope}>
                {JIRA_SCOPES.map((id) => <option key={id} value={id}>{scopeLabels[id]}</option>)}
              </select>
            </label>
          </div>
          <label>
            <Trans>Jira search (JQL)</Trans>
            <input
              maxLength={2000}
              onChange={(event) => setJql(event.target.value)}
              spellCheck={false}
              value={jql}
            />
          </label>
          <button className="secondary-button" disabled={busy || !jql.trim()} type="submit">
            <Trans>Find issues</Trans>
          </button>
        </form>
      )}

      {problem && <p className="jira-problem" role="alert">{problem}</p>}

      {status.connected && results && (
        results.issues.length ? (
          <div className="jira-results">
            <ul>
              {results.issues.map(({ key, title }) => {
                const queued = queuedKeys.has(key);
                return (
                  <li key={key}>
                    <label>
                      <input
                        checked={!queued && selected.has(key)}
                        disabled={queued}
                        onChange={() => toggle(key)}
                        type="checkbox"
                      />
                      <b>{key}</b>
                      <span>{title}</span>
                      {queued && <em><Trans>In queue</Trans></em>}
                    </label>
                  </li>
                );
              })}
            </ul>
            {results.nextPageToken && (
              <button className="text-button" disabled={busy} onClick={loadMore} type="button">
                <Trans>Load more issues</Trans>
              </button>
            )}
            <div className="jira-results-actions">
              <small>
                {selectedCount > slotsLeft
                  ? <Plural value={Math.max(slotsLeft, 0)} one="Only # more item fits in the queue" other="Only # more items fit in the queue" />
                  : <Plural value={selectedCount} one="# issue selected" other="# issues selected" />}
              </small>
              <button
                className="primary-button"
                disabled={!selectedCount || selectedCount > slotsLeft}
                onClick={importSelected}
                type="button"
              >
                <Trans>Add to session</Trans>
              </button>
            </div>
          </div>
        ) : (
          <p><Trans>No issues match that search.</Trans></p>
        )
      )}
    </section>
  );
}
