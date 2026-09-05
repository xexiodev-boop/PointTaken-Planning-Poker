import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { readDisplayName, rememberDisplayName } from "../lib/displayName.js";
import { LanguageSwitcher } from "./LanguageSwitcher.jsx";

function roomNameFromId(roomId) {
  return roomId
    .split("-")
    .slice(0, -1)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function JoinRoom({ roomId, onJoin, error }) {
  const { t } = useLingui();
  const [name, setName] = useState(readDisplayName);
  const roomName = roomNameFromId(roomId);

  function submit(event) {
    event.preventDefault();
    if (name.trim()) {
      rememberDisplayName(name);
      onJoin(name);
    }
  }

  return (
    <main className="center-shell">
      <section className="join-card">
        <a className="brand" href="/">
          <span className="brand-mark">P</span>
          <span>Point Taken</span>
        </a>
        <p className="eyebrow"><Trans>You’ve been invited</Trans></p>
        <h1><Trans>Join the planning room</Trans></h1>
        <form onSubmit={submit}>
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
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button" type="submit"><Trans>Join room</Trans></button>
        </form>
        <small className="room-code"><Trans>You’re joining {roomName}</Trans></small>
        <small className="join-privacy">
          <Trans>
            No account needed. <a href="/privacy">How your data is handled</a>.
          </Trans>
        </small>
        <div className="entry-footer">
          <LanguageSwitcher />
        </div>
      </section>
    </main>
  );
}

// Shown when a URL carries a ?recover= code, before it is spent. Redeeming
// takes facilitation from whoever holds it, so a link shared by mistake must
// not do that silently just because someone opened it.
export function RecoveryPrompt({ roomId, onDecide }) {
  const roomName = roomNameFromId(roomId);

  return (
    <main className="center-shell">
      <section className="join-card recovery-prompt">
        <a className="brand" href="/">
          <span className="brand-mark">P</span>
          <span>Point Taken</span>
        </a>
        <p className="eyebrow"><Trans>Facilitator recovery link</Trans></p>
        <h1><Trans>This link is not an invitation</Trans></h1>
        <p className="recovery-prompt-copy">
          <Trans>
            It is the recovery key for {roomName}. Using it makes you the facilitator and
            signs out whoever is running the room right now. If someone sent it to invite
            you, join as a participant instead.
          </Trans>
        </p>
        <div className="recovery-prompt-actions">
          <button className="primary-button" onClick={() => onDecide(false)} type="button">
            <Trans>Join as a participant</Trans>
          </button>
          <button className="secondary-button" onClick={() => onDecide(true)} type="button">
            <Trans>Take over as facilitator</Trans>
          </button>
        </div>
        <small className="join-privacy">
          <Trans>Only use the second option if this is your own room and you saved this link.</Trans>
        </small>
        <div className="entry-footer">
          <LanguageSwitcher />
        </div>
      </section>
    </main>
  );
}

export function LoadingRoom({ status, error }) {
  return (
    <main className="center-shell">
      <div className="loading-card">
        <div className="spinner" />
        <h2>
          {status === "reconnecting"
            ? <Trans>Finding the room again…</Trans>
            : <Trans>Pulling up a chair…</Trans>}
        </h2>
        {error && <p className="form-error">{error}</p>}
        <div className="entry-footer">
          <LanguageSwitcher />
        </div>
      </div>
    </main>
  );
}
