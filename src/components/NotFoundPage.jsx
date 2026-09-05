import { Trans } from "@lingui/react/macro";
import { LanguageSwitcher } from "./LanguageSwitcher.jsx";

// Decorative: the group is hidden from assistive tech, the heading carries it.
const DIGITS = ["4", "0", "4"];

const COPY = {
  expired: {
    title: <Trans>This room has expired</Trans>,
    body: (
      <Trans>
        Rooms and everything in them are deleted 7 days after the last activity. Start a
        new one and share the fresh invite link with your team.
      </Trans>
    ),
  },
  deleted: {
    title: <Trans>This room was deleted</Trans>,
    body: (
      <Trans>
        The facilitator deleted this room, along with its votes and history. Start a new
        one and share the fresh invite link with your team.
      </Trans>
    ),
  },
  room: {
    title: <Trans>That room link isn’t valid</Trans>,
    body: (
      <Trans>
        The link may be incomplete or mistyped. Ask whoever invited you to send it again,
        or start a room of your own.
      </Trans>
    ),
  },
  page: {
    title: <Trans>This page doesn’t exist</Trans>,
    body: <Trans>The link may be out of date or mistyped. Nothing to estimate here.</Trans>,
  },
};

export function NotFoundPage({ reason = "page" }) {
  const copy = COPY[reason] ?? COPY.page;
  const roomGone = reason === "expired" || reason === "deleted";

  return (
    <main className="center-shell">
      <section className="notfound-card">
        <a className="brand" href="/">
          <span className="brand-mark">P</span>
          <span>Point Taken</span>
        </a>
        <div className="notfound-cards" aria-hidden="true">
          {DIGITS.map((digit, index) => (
            <span className="notfound-digit" key={index}>
              <small>{digit}</small>
              <strong>{digit}</strong>
              <small>{digit}</small>
            </span>
          ))}
        </div>
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        <a className="primary-button" href="/">
          {roomGone
            ? <Trans>Create a new room</Trans>
            : <Trans>Go to the home page</Trans>}
        </a>
        <div className="notfound-footer">
          <LanguageSwitcher />
        </div>
      </section>
    </main>
  );
}
