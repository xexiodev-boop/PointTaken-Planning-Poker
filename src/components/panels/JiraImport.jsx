import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ROOM_LIMITS } from "../../../shared/limits.js";
import { useModal } from "../../hooks/useModal.js";
import { buildJql, JIRA_SCOPES, jiraProjects, jiraSearch } from "../../lib/jira.js";

const DEFAULT_SCOPE = "backlog";
// Keeps each add_items message well under the 16 KB socket limit.
const IMPORT_BATCH = 20;

export function JiraImport({ room, send, jira, onClose }) {
  const { t } = useLingui();
  const { status, signIn, refresh, connect, disconnect } = jira;
  const [siteId, setSiteId] = useState("");
  const [projects, setProjects] = useState([]);
  const [projectKey, setProjectKey] = useState("");
  const [scope, setScope] = useState(DEFAULT_SCOPE);
  const [jql, setJql] = useState("");
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const dialogRef = useModal(onClose);

  const pendingItems = useMemo(
    () => room.items.filter((item) => item.status === "pending"),
    [room.items],
  );
  const queuedKeys = useMemo(
    () => new Set(pendingItems.map((item) => item.key).filter(Boolean)),
    [pendingItems],
  );
  const slotsLeft = Math.max(ROOM_LIMITS.pendingItems - pendingItems.length, 0);
  const activeSiteId = status.sites.some(({ id }) => id === siteId) ? siteId : status.sites[0]?.id ?? "";
  const site = status.sites.find(({ id }) => id === activeSiteId) ?? null;
  const scopeLabels = {
    open_sprints: t`Active sprint`,
    future_sprints: t`Upcoming sprints`,
    backlog: t`Backlog (no sprint)`,
    all_open: t`All open issues`,
  };

  const fail = useCallback((error) => {
    if (error.status === 401) refresh();
    setProblem(error.message);
  }, [refresh]);

  useEffect(() => {
    if (!activeSiteId) return undefined;
    let stale = false;
    jiraProjects(activeSiteId)
      .then(({ projects: found }) => {
        if (stale) return;
        const first = found[0]?.key ?? "";
        setProjects(found);
        setProjectKey(first);
        setScope(DEFAULT_SCOPE);
        setJql(first ? buildJql(first, DEFAULT_SCOPE) : "");
        setResults(null);
      })
      .catch((error) => {
        if (!stale) fail(error);
      });
    return () => {
      stale = true;
    };
  }, [activeSiteId, fail]);

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
      const found = await jiraSearch(activeSiteId, jql);
      setResults({ ...found, jql });
      setSelected(new Set(
        found.issues.filter(({ key }) => !queuedKeys.has(key)).slice(0, slotsLeft).map(({ key }) => key),
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
      const more = await jiraSearch(activeSiteId, results.jql, results.nextPageToken);
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

  const selectable = results ? results.issues.filter(({ key }) => !queuedKeys.has(key)) : [];
  const chosen = selectable.filter(({ key }) => selected.has(key));

  function importSelected() {
    const items = chosen.map(({ key, title }) => ({ key, title }));
    for (let index = 0; index < items.length; index += IMPORT_BATCH) {
      send({ type: "add_items", items: items.slice(index, index + IMPORT_BATCH), siteUrl: site.url });
    }
    onClose();
  }

  return (
    <div className="workspace-backdrop jira-backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby="jira-import-title"
        aria-modal="true"
        className="items-screen jira-screen workspace-modal"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <header className="items-screen-header">
          <div>
            <p className="eyebrow"><Trans>Estimation queue</Trans></p>
            <h1 id="jira-import-title"><Trans>Import from Jira</Trans></h1>
            <p><Trans>Find issues and add them to the estimation queue.</Trans></p>
          </div>
          <div className="workspace-header-actions">
            {status.connected && (
              <>
                {site && <span className="items-room-name">{site.name}</span>}
                <button className="text-button" onClick={disconnect} type="button"><Trans>Disconnect</Trans></button>
              </>
            )}
            <button className="workspace-close" onClick={onClose} type="button" aria-label={t`Close Jira import`}><X size={17} aria-hidden="true" /></button>
          </div>
        </header>

        {!status.connected && (
          <div className="jira-connect">
            <h2><Trans>Connect Jira</Trans></h2>
            <p>
              <Trans>
                Sign in with Atlassian to pull issues straight into the queue. Access is read-only, lasts
                about an hour, and stays in this browser.
              </Trans>
            </p>
            {signIn === "waiting" && (
              <p className="jira-waiting" role="status">
                <Trans>Finish signing in in the Atlassian window. This panel updates when you are done.</Trans>
              </p>
            )}
            {signIn === "blocked" && (
              <p className="jira-problem" role="alert">
                <Trans>Your browser blocked the Jira window. Allow pop-ups for this site and try again.</Trans>
              </p>
            )}
            {signIn === "failed" && (
              <p className="jira-problem" role="alert"><Trans>Jira was not connected. Try again.</Trans></p>
            )}
            <button className="primary-button compact" onClick={connect} type="button">
              {signIn === "waiting" ? <Trans>Open the Atlassian window again</Trans> : <Trans>Connect Jira</Trans>}
            </button>
          </div>
        )}

        {status.connected && !site && (
          <div className="jira-connect">
            <p><Trans>This Atlassian account has no Jira site that Point Taken was given access to.</Trans></p>
          </div>
        )}

        {status.connected && site && (
          <div className="items-workspace jira-workspace">
            <section className="items-composer jira-search">
              <span className="item-step">01</span>
              <h2><Trans>Find issues</Trans></h2>
              <p><Trans>Pick a project, or write your own Jira search.</Trans></p>
              <form onSubmit={runSearch}>
                {status.sites.length > 1 && (
                  <label>
                    <Trans>Site</Trans>
                    <select onChange={(event) => setSiteId(event.target.value)} value={activeSiteId}>
                      {status.sites.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                    </select>
                  </label>
                )}
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
                <label>
                  <Trans>Jira search (JQL)</Trans>
                  <textarea
                    maxLength={2000}
                    onChange={(event) => setJql(event.target.value)}
                    rows={3}
                    spellCheck={false}
                    value={jql}
                  />
                </label>
                {problem && <p className="jira-problem" role="alert">{problem}</p>}
                <button className="primary-button compact" disabled={busy || !jql.trim()} type="submit">
                  <Trans>Find issues</Trans>
                </button>
              </form>
            </section>

            <section className="jira-results">
              <div className="items-queue-heading">
                <div>
                  <span className="item-step">02</span>
                  <h2><Trans>Issues</Trans></h2>
                </div>
                {selectable.length > 0 && (
                  <button
                    className="text-button"
                    onClick={() => setSelected(new Set(chosen.length ? [] : selectable.map(({ key }) => key)))}
                    type="button"
                  >
                    {chosen.length ? <Trans>Clear selection</Trans> : <Trans>Select all</Trans>}
                  </button>
                )}
              </div>
              {!results && (
                <div className="items-queue-empty">
                  <strong><Trans>No search yet</Trans></strong>
                  <p><Trans>Run a search and the matching issues will appear here.</Trans></p>
                </div>
              )}
              {results && !results.issues.length && (
                <div className="items-queue-empty">
                  <strong><Trans>No issues match that search.</Trans></strong>
                </div>
              )}
              {results && results.issues.length > 0 && (
                <>
                  <ul>
                    {results.issues.map(({ key, title, type }) => {
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
                            {type && <small>{type}</small>}
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
                      {chosen.length > slotsLeft
                        ? <Plural value={slotsLeft} one="Only # more item fits in the queue" other="Only # more items fit in the queue" />
                        : <Plural value={chosen.length} one="# issue selected" other="# issues selected" />}
                    </small>
                    <button
                      className="primary-button compact"
                      disabled={!chosen.length || chosen.length > slotsLeft}
                      onClick={importSelected}
                      type="button"
                    >
                      <Trans>Add to session</Trans>
                    </button>
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
