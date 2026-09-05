import { Trans, useLingui } from "@lingui/react/macro";
import { Check, Ellipsis, Eye, X } from "lucide-react";
import { useState } from "react";
import { useConfirmation } from "../../hooks/useConfirmation.jsx";
import { useModal } from "../../hooks/useModal.js";

export function PeopleList({ room, send }) {
  const { t } = useLingui();
  const [managerOpen, setManagerOpen] = useState(false);
  const isFacilitator = room.viewer.role === "facilitator";

  function presenceLabel(person) {
    if (person.role === "facilitator") return t`Facilitator`;
    if (person.role === "observer") {
      return person.connected ? t`Observer · Here` : t`Observer · Away`;
    }
    return person.connected ? t`At the table` : t`Away`;
  }

  return (
    <>
      <section className="side-section">
        <div className="side-heading">
          <h2><Trans>People</Trans></h2>
          <div className="people-heading-actions">
            {isFacilitator && !room.isClosed && (
              <button onClick={() => setManagerOpen(true)} type="button"><Trans>Manage</Trans></button>
            )}
            <span>{room.participants.length}</span>
          </div>
        </div>
        <div className="people-list">
          {room.participants.map((person) => {
            const isYou = person.id === room.viewer.id;
            return (
            <div className="person-row" key={person.id}>
              <span className={`avatar${isYou ? " is-you" : ""}`} style={{ backgroundColor: person.color }}>
                {person.displayName.charAt(0).toUpperCase()}
              </span>
              <div>
                <strong>{person.displayName}</strong>
                <small>
                  {isYou && <span className="you-flag"><Trans>You</Trans> · </span>}
                  {presenceLabel(person)}
                </small>
              </div>
              {room.currentRound?.phase === "voting" && person.eligible && (
                <i className={person.hasVoted ? "voted" : ""}>
                  {person.hasVoted
                    ? <Check size={13} aria-hidden="true" />
                    : <Ellipsis size={13} aria-hidden="true" />}
                </i>
              )}
              {person.role === "observer" && <i className="observer-mark" title={t`Observer`}><Eye size={13} aria-hidden="true" /></i>}
            </div>
            );
          })}
        </div>
      </section>
      {managerOpen && (
        <ParticipantManager
          room={room}
          send={send}
          onClose={() => setManagerOpen(false)}
        />
      )}
    </>
  );
}

function ParticipantManager({ room, send, onClose }) {
  const { t } = useLingui();
  const activeRound = room.currentRound && room.currentRound.phase !== "finalized";
  const { confirm, confirmationDialog } = useConfirmation();
  const others = room.participants.filter((person) => person.id !== room.viewer.id);
  const dialogRef = useModal(onClose);

  async function transfer(person) {
    const accepted = await confirm({
      title: t`Make ${person.displayName} facilitator?`,
      message: t`You’ll become a regular participant and they’ll receive all facilitator controls.`,
      confirmLabel: t`Transfer facilitator`,
    });
    if (!accepted) return;
    send({ type: "transfer_facilitator", participantId: person.id });
    onClose();
  }

  async function remove(person) {
    const accepted = await confirm({
      title: t`Remove ${person.displayName}?`,
      message: activeRound
        ? t`They’ll leave immediately and their current vote will be discarded.`
        : t`They’ll be disconnected and their room identity will stop working.`,
      confirmLabel: t`Remove person`,
      tone: "danger",
    });
    if (accepted) send({ type: "remove_participant", participantId: person.id });
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby="participant-manager-title"
        aria-modal="true"
        className="participant-panel"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <div>
            <p className="eyebrow"><Trans>Facilitator controls</Trans></p>
            <h2 id="participant-manager-title"><Trans>Manage people</Trans></h2>
            <p><Trans>Choose who votes, observes, or facilitates the room.</Trans></p>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label={t`Close people manager`}><X size={17} aria-hidden="true" /></button>
        </header>

        {activeRound && (
          <div className="settings-notice">
            <Trans>During a round you can remove people, but roles and facilitator ownership stay fixed.</Trans>
          </div>
        )}

        <div className="participant-list">
          <div className="participant-manage-row current-facilitator">
            <span className="avatar" style={{ backgroundColor: room.viewer.color }}>
              {room.viewer.displayName.charAt(0).toUpperCase()}
            </span>
            <div>
              <strong>{room.viewer.displayName}</strong>
              <small><Trans>You · Facilitator</Trans></small>
            </div>
            <span className="role-badge facilitator"><Trans>Facilitator</Trans></span>
          </div>

          {others.map((person) => (
            <div className="participant-manage-row" key={person.id}>
              <span className="avatar" style={{ backgroundColor: person.color }}>
                {person.displayName.charAt(0).toUpperCase()}
              </span>
              <div>
                <strong>{person.displayName}</strong>
                <small>{person.connected ? <Trans>Connected</Trans> : <Trans>Away</Trans>}</small>
              </div>
              <select
                aria-label={t`Role for ${person.displayName}`}
                disabled={activeRound}
                onChange={(event) => send({
                  type: "set_participant_role",
                  participantId: person.id,
                  role: event.target.value,
                })}
                value={person.role}
              >
                <option value="participant">{t`Participant`}</option>
                <option value="observer">{t`Observer`}</option>
              </select>
              <div className="participant-actions">
                <button
                  disabled={activeRound}
                  onClick={() => transfer(person)}
                  type="button"
                  title={t`Transfer facilitator ownership`}
                >
                  <Trans>Make facilitator</Trans>
                </button>
                <button className="remove" onClick={() => remove(person)} type="button">
                  <Trans>Remove</Trans>
                </button>
              </div>
            </div>
          ))}

          {others.length === 0 && (
            <div className="participant-empty">
              <Trans>Invite someone with the room link and they’ll appear here.</Trans>
            </div>
          )}
        </div>
        {confirmationDialog}
      </section>
    </div>
  );
}
