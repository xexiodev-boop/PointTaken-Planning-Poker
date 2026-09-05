import { Trans } from "@lingui/react/macro";
import { useEffect, useRef } from "react";

export function CardHand({ room, send }) {
  const round = room.currentRound;
  const viewer = room.participants.find(({ id }) => id === room.viewer.id);
  const selected = round?.ownVote?.value;
  const confirmed = round?.ownVote?.confirmed;
  const handRef = useRef(null);
  const shouldShowHand = !room.isClosed && round?.phase === "voting" && viewer?.eligible && !selected;

  useEffect(() => {
    if (!shouldShowHand) return undefined;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      handRef.current?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "center",
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [round?.id, shouldShowHand]);

  if (room.isClosed || !round || round.phase !== "voting") return null;

  if (!viewer?.eligible) {
    return (
      <div className="late-join-note">
        {room.viewer.role === "observer"
          ? <Trans>You’re observing this session. Observers can follow the discussion without voting.</Trans>
          : <Trans>You joined during this round. Your hand opens on the next task.</Trans>}
      </div>
    );
  }

  return (
    <section
      className={`hand ${selected ? "" : "needs-action"}`}
      id={`voting-hand-${round.id}`}
      ref={handRef}
    >
      <div className="hand-heading">
        <div>
          <p className="eyebrow"><Trans>Your hand</Trans></p>
          <h3>
            {confirmed
              ? <Trans>Vote locked</Trans>
              : selected
                ? <Trans>Ready to lock it in?</Trans>
                : <Trans>Pick the closest fit</Trans>}
          </h3>
          {!selected && <small className="hand-prompt"><Trans>Select one card to continue</Trans></small>}
        </div>
        {selected && !confirmed && (
          <button className="primary-button compact" onClick={() => send({ type: "confirm_vote" })} type="button">
            <Trans>Confirm {selected}</Trans>
          </button>
        )}
        {confirmed && <span className="locked-badge"><Trans>Locked · {selected}</Trans></span>}
      </div>
      <div className="cards">
        {room.deck.cards.map((value) => (
          <button
            aria-pressed={selected === value}
            className={`poker-card ${selected === value ? "selected" : ""}`}
            key={value}
            onClick={() => send({ type: "select_vote", value })}
            type="button"
          >
            {/* The corner pips draw the card face; only the centre value is announced. */}
            <small aria-hidden="true">{value}</small>
            <strong>{value}</strong>
            <small aria-hidden="true">{value}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
