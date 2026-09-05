import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowUpRight, X } from "lucide-react";
import { useState } from "react";
import { DECKS, DEFAULT_DECK_ID } from "../../shared/decks.js";
import { api } from "../lib/api.js";
import { readDisplayName, rememberDisplayName } from "../lib/displayName.js";
import { deckName } from "../lib/labels.js";
import { dismissRecentRoom, visibleRecentRoom } from "../lib/recentRoom.js";
import { stashRecoveryCode } from "../lib/recovery.js";
import { GithubIcon } from "./icons.jsx";
import { LanguageSwitcher } from "./LanguageSwitcher.jsx";

export function HomePage() {
  const { t, i18n } = useLingui();
  const [name, setName] = useState(readDisplayName);
  const [deckId, setDeckId] = useState(DEFAULT_DECK_ID);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recentRoom, setRecentRoom] = useState(visibleRecentRoom);
  const platform = navigator.userAgentData?.platform ?? navigator.userAgent;
  const bookmarkShortcut = /mac/i.test(platform) ? "⌘D" : "Ctrl+D";

  async function createRoom(event) {
    event.preventDefault();
    if (!name.trim()) return setError(t`Tell the room what to call you.`);
    setLoading(true);
    setError("");
    rememberDisplayName(name);
    try {
      const result = await api("/api/rooms", {
        method: "POST",
        body: JSON.stringify({ name, deckId }),
      });
      stashRecoveryCode(result.roomId, result.recoveryCode);
      window.location.assign(`/room/${result.roomId}`);
    } catch (requestError) {
      setError(requestError.message);
      setLoading(false);
    }
  }

  return (
    <main className="home-shell">
      {recentRoom && (
        <aside className="recent-room-banner">
          <ArrowUpRight className="recent-room-icon" size={16} aria-hidden="true" />
          <div>
            <small><Trans>Your planning room is still active</Trans></small>
            <strong>{recentRoom.name}</strong>
            <p>
              {recentRoom.role === "facilitator"
                ? <Trans>You created this room.</Trans>
                : <Trans>You joined this room.</Trans>}{" "}
              <Trans>Open it again, then press <kbd>{bookmarkShortcut}</kbd> inside the room to bookmark it.</Trans>
            </p>
          </div>
          <a href={recentRoom.path}><Trans>Open room</Trans></a>
          <button
            aria-label={t`Dismiss room reminder`}
            onClick={() => {
              dismissRecentRoom(recentRoom.roomId);
              setRecentRoom(null);
            }}
            type="button"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </aside>
      )}
      <section className="hero">
        <a className="brand" href="/">
          <span className="brand-mark">P</span>
          <span>Point Taken</span>
        </a>
        <div className="hero-copy">
          <p className="eyebrow"><Trans>Planning poker without the ceremony</Trans></p>
          <h1><Trans>Find the estimate your team can stand behind.</Trans></h1>
          <p className="lede">
            <Trans>
              Open a room, invite your team, and turn different instincts into one clear decision.
              No accounts. No setup detour.
            </Trans>
          </p>
          <div className="promise-row" aria-label={t`Product highlights`}>
            <span><Trans>Always free</Trans></span>
            <span><Trans>Live voting</Trans></span>
            <span><Trans>Custom decks</Trans></span>
            <span><Trans>Seven-day rooms</Trans></span>
          </div>
        </div>
      </section>

      <section className="create-panel">
        <div>
          <p className="step-label"><Trans>Create a room</Trans></p>
          <h2><Trans>You’ll be the facilitator.</Trans></h2>
          <p className="muted"><Trans>Choose a deck now. You can invite everyone once you’re inside.</Trans></p>
        </div>

        <form onSubmit={createRoom}>
          <label>
            <Trans>Your name</Trans>
            <input
              autoFocus
              maxLength={32}
              onChange={(event) => setName(event.target.value)}
              placeholder={t`Your name`}
              value={name}
            />
          </label>

          <fieldset>
            <legend><Trans>Planning deck</Trans></legend>
            <p className="field-hint"><Trans>Pick one to start. You can tweak the deck later in room settings.</Trans></p>
            <div className="deck-options">
              {Object.values(DECKS).map((deck) => (
                <label className={`deck-option ${deckId === deck.id ? "selected" : ""}`} key={deck.id}>
                  <input
                    checked={deckId === deck.id}
                    name="deck"
                    onChange={() => setDeckId(deck.id)}
                    type="radio"
                    value={deck.id}
                  />
                  <span>
                    <strong>{deckName(deck)}</strong>
                    <small>{deck.cards.slice(0, 7).join(" · ")}</small>
                  </span>
                  <i aria-hidden="true" />
                </label>
              ))}
            </div>
          </fieldset>

          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" disabled={loading} type="submit">
            {loading ? <Trans>Opening the room…</Trans> : <Trans>Create planning room</Trans>}
          </button>
        </form>
      </section>

      <footer className="home-footer">
        <span><Trans>Free · privacy-first · no accounts</Trans></span>
        <a href={i18n.locale === "es" ? "/es/what-is-planning-poker" : "/what-is-planning-poker"}>
          <Trans>What is planning poker?</Trans>
        </a>
        <a href={i18n.locale === "es" ? "/es/how-to-run-planning-poker" : "/how-to-run-planning-poker"}>
          <Trans>Run a session</Trans>
        </a>
        <a href={i18n.locale === "es" ? "/es/planning-poker-remote-teams" : "/planning-poker-remote-teams"}>
          <Trans>Remote teams</Trans>
        </a>
        <a href="/privacy"><Trans>Usage &amp; privacy</Trans></a>
        <a
          className="github-link"
          href="https://github.com/xexiodev-boop/planning-poker"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View source on GitHub"
        >
          <GithubIcon />
          GitHub
        </a>
        <LanguageSwitcher />
        <span><Trans>Made by <a href="https://xexio.dev" target="_blank" rel="noopener noreferrer">xexio.dev</a></Trans></span>
      </footer>
    </main>
  );
}
