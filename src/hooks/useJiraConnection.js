import { useCallback, useEffect, useState } from "react";
import { jiraDisconnect, jiraStatus, onJiraWindowResult, openJiraWindow } from "../lib/jira.js";

const OFFLINE = { available: false, connected: false, sites: [] };

export function useJiraConnection(locale) {
  const [status, setStatus] = useState(null);
  // null | "waiting" | "blocked" | "failed"
  const [signIn, setSignIn] = useState(null);

  const refresh = useCallback(async () => {
    const next = await jiraStatus().catch(() => OFFLINE);
    setStatus(next);
    if (next.connected) setSignIn(null);
  }, []);

  useEffect(() => {
    refresh();
    return onJiraWindowResult((result) => {
      setSignIn(result === "connected" ? null : "failed");
      refresh();
    });
  }, [refresh]);

  // Fallback for browsers where the sign-in window cannot report back.
  const awaitingSignIn = Boolean(status?.available && !status.connected);
  useEffect(() => {
    if (!awaitingSignIn) return undefined;
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [awaitingSignIn, refresh]);

  // Must be called straight from a click handler, or the browser blocks the window.
  const connect = useCallback(() => {
    setSignIn(openJiraWindow(locale) ? "waiting" : "blocked");
  }, [locale]);

  const disconnect = useCallback(async () => {
    await jiraDisconnect().catch(() => {});
    setSignIn(null);
    await refresh();
  }, [refresh]);

  return { status, signIn, refresh, connect, disconnect };
}
