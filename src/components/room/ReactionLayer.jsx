import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { REACTION_OPTIONS } from "../../../shared/reactions.js";
import { reactionLabel } from "../../lib/labels.js";

export function ReactionLayer({ room, send }) {
  const { t } = useLingui();
  const enabled = room.settings.reactionsEnabled;
  const muted = room.settings.reactionsMuted;
  const ownHandRaised = room.raisedHands.some(({ participantId }) => participantId === room.viewer.id);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef(null);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);
  const reactions = room.settings.reactionPalette.filter((reaction) => reaction !== "✋");

  useEffect(() => {
    if (!pickerOpen) return undefined;
    // Move focus into the menu when it opens so arrow keys have a starting point.
    menuRef.current?.querySelector('[role="menuitem"]')?.focus();
    function closeOnOutsideClick(event) {
      if (!pickerRef.current?.contains(event.target)) setPickerOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key === "Escape") {
        setPickerOpen(false);
        triggerRef.current?.focus();
      }
    }
    window.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [pickerOpen]);

  function moveMenuFocus(event) {
    const items = menuRef.current ? [...menuRef.current.querySelectorAll('[role="menuitem"]')] : [];
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement);
    const keys = {
      ArrowRight: (current + 1) % items.length,
      ArrowDown: (current + 1) % items.length,
      ArrowLeft: (current - 1 + items.length) % items.length,
      ArrowUp: (current - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    };
    if (!(event.key in keys)) return;
    event.preventDefault();
    items[keys[event.key]].focus();
  }

  if (room.isClosed) return null;
  if (!enabled && room.viewer.role !== "facilitator") return null;

  return (
    <>
      <div className="floating-reactions" aria-live="polite">
        {room.reactions.map((reaction, index) => (
          <div
            className="floating-reaction"
            key={reaction.id}
            style={{
              "--reaction-color": reaction.color,
              "--reaction-offset": `${(index % 5) * 34}px`,
            }}
          >
            <strong>{reaction.reaction}</strong>
            <span>{reaction.participantName}</span>
          </div>
        ))}
      </div>
      {room.raisedHands.length > 0 && (
        <div className="raised-hands">
          <strong>✋ {room.raisedHands.length}</strong>
          <span>{room.raisedHands.map(({ participantName }) => participantName).join(", ")}</span>
        </div>
      )}
      {enabled && (
        <div className={`reaction-toolbar ${muted ? "muted" : ""}`} ref={pickerRef}>
          <div
            aria-label={t`Choose a reaction`}
            className={`reaction-popover ${pickerOpen ? "open" : ""}`}
            onKeyDown={moveMenuFocus}
            ref={menuRef}
            role="menu"
          >
            {reactions.map((reaction) => (
              <button
                aria-label={reactionLabel(reaction, REACTION_OPTIONS.find(({ emoji }) => emoji === reaction)?.label ?? reaction)}
                key={reaction}
                onClick={() => {
                  send({ type: "send_reaction", reaction });
                  setPickerOpen(false);
                }}
                tabIndex={pickerOpen ? 0 : -1}
                title={reactionLabel(reaction, REACTION_OPTIONS.find(({ emoji }) => emoji === reaction)?.label)}
                role="menuitem"
                type="button"
              >
                {reaction}
              </button>
            ))}
          </div>
          <button
            aria-expanded={pickerOpen}
            aria-haspopup="menu"
            className="reaction-trigger"
            disabled={muted || reactions.length === 0}
            onClick={() => setPickerOpen((open) => !open)}
            ref={triggerRef}
            type="button"
          >
            {/* Emoji, not an icon: this button drops emoji, so it should
                preview what it dispenses. */}
            <span aria-hidden="true">🙂</span>
            <Trans>React</Trans>
          </button>
          <button
            className={`hand-trigger ${ownHandRaised ? "active" : ""}`}
            disabled={muted && !ownHandRaised}
            onClick={() => send({
              type: ownHandRaised ? "lower_hand" : "send_reaction",
              reaction: "✋",
            })}
            type="button"
          >
            <span aria-hidden="true">✋</span>
            {ownHandRaised ? <Trans>Lower hand</Trans> : <Trans>Raise hand</Trans>}
          </button>
          {muted && <small><Trans>Reactions paused</Trans></small>}
        </div>
      )}
    </>
  );
}
