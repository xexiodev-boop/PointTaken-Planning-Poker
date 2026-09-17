import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { ArrowRight, GripVertical, X } from "lucide-react";
import { useState } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SUGGESTION_ALGORITHMS } from "../../../shared/algorithms.js";
import { DECKS } from "../../../shared/decks.js";
import { ROOM_LIMITS } from "../../../shared/limits.js";
import { HAND_REACTION, REACTION_OPTIONS } from "../../../shared/reactions.js";
import { REVEAL_DELAY_OPTIONS } from "../../../shared/reveal.js";
import { useConfirmation } from "../../hooks/useConfirmation.jsx";
import { useModal } from "../../hooks/useModal.js";
import { algorithmDescription, algorithmName, reactionLabel, revealDelayLabel } from "../../lib/labels.js";

export function RoomSettings({ room, send, onClose, onManageItems, issuedRecoveryCode, onError }) {
  const { t } = useLingui();
  const [recoveryCopied, setRecoveryCopied] = useState(false);
  const issuedRecoveryLink = issuedRecoveryCode
    ? `${window.location.origin}/room/${room.id}?recover=${issuedRecoveryCode}`
    : null;
  const [cards, setCards] = useState(room.deck.cards);
  const [newCard, setNewCard] = useState("");
  const [algorithm, setAlgorithm] = useState(room.settings.suggestionAlgorithm);
  const [timer, setTimer] = useState(room.settings.revealDelaySeconds);
  const [autoReveal, setAutoReveal] = useState(room.settings.autoRevealEnabled);
  const [facilitatorVotes, setFacilitatorVotes] = useState(room.settings.facilitatorVotes);
  const [confirmVotes, setConfirmVotes] = useState(room.settings.confirmVotes);
  const [reactionsEnabled, setReactionsEnabled] = useState(room.settings.reactionsEnabled);
  const [reactionPalette, setReactionPalette] = useState(room.settings.reactionPalette);
  const activeRound = room.currentRound && room.currentRound.phase !== "finalized";
  // Settings are read-only while a round is running (finish it first) or once the
  // room is closed. Deletion stays available in both cases.
  const editingDisabled = activeRound || room.isClosed;
  const { confirm, confirmationDialog } = useConfirmation();
  const dialogRef = useModal(onClose);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function addCard(event) {
    event.preventDefault();
    const value = newCard.trim();
    if (!value || cards.includes(value) || cards.length >= ROOM_LIMITS.cards) return;
    setCards([...cards, value]);
    setNewCard("");
  }

  function reorderCards(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setCards((currentCards) => {
      const oldIndex = currentCards.indexOf(active.id);
      const newIndex = currentCards.indexOf(over.id);
      return arrayMove(currentCards, oldIndex, newIndex);
    });
  }

  function save() {
    send({
      type: "update_settings",
      cards,
      suggestionAlgorithm: algorithm,
      revealDelaySeconds: Number(timer),
      autoRevealEnabled: autoReveal,
      facilitatorVotes,
      confirmVotes,
      reactionsEnabled,
      reactionPalette,
    });
    onClose();
  }

  function resetDeck() {
    const original = DECKS[room.deck.id];
    if (original) setCards([...original.cards]);
  }

  async function closeRoom() {
    const accepted = await confirm({
      title: t`Close this room?`,
      message: t`Existing participants can review completed estimates, but nobody will be able to vote or join.`,
      confirmLabel: t`Close room`,
      tone: "danger",
    });
    if (!accepted) return;
    send({ type: "close_room" });
    onClose();
  }

  // Only the hash of a recovery code is stored, so a lost link can never be
  // shown again. Minting a replacement is the only way back, and it invalidates
  // whatever the facilitator saved before.
  async function regenerateRecovery() {
    const accepted = await confirm({
      title: t`Generate a new recovery link?`,
      message: t`Any recovery link you saved before will stop working. Only the new one will reclaim this room.`,
      confirmLabel: t`Generate new link`,
    });
    if (accepted) {
      setRecoveryCopied(false);
      send({ type: "regenerate_recovery" });
    }
  }

  async function copyRecoveryLink() {
    try {
      await navigator.clipboard.writeText(issuedRecoveryLink);
      setRecoveryCopied(true);
    } catch {
      onError(t`Couldn’t copy automatically. Select and copy the link manually.`);
    }
  }

  async function deleteRoom() {
    const accepted = await confirm({
      title: t`Delete this room permanently?`,
      message: t`All items, votes, participants, and completed estimates will be erased immediately. This cannot be undone.`,
      confirmLabel: t`Delete room`,
      tone: "danger",
    });
    if (!accepted) return;
    send({ type: "delete_room" });
  }

  const pendingCount = room.items.filter((item) => item.status === "pending").length;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        aria-labelledby="room-settings-title"
        aria-modal="true"
        className="settings-panel"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <div>
            <p className="eyebrow"><Trans>Facilitator controls</Trans></p>
            <h2 id="room-settings-title"><Trans>Room settings</Trans></h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label={t`Close settings`}><X size={17} aria-hidden="true" /></button>
        </header>

        <div className="settings-content">
          {room.isClosed ? (
            <div className="settings-notice">
              <Trans>This room is closed and read-only. Settings can’t be changed, but you can still delete it below.</Trans>
            </div>
          ) : activeRound ? (
            <div className="settings-notice">
              <Trans>Finish the current round before changing its deck or suggestion rules.</Trans>
            </div>
          ) : null}
          <section className="settings-group">
            <div className="settings-title">
              <div>
                <h3><Trans>Items to estimate</Trans></h3>
                <p><Trans>Prepare and maintain the work this room will estimate.</Trans></p>
              </div>
              <span className="pending-count">
                <Plural value={pendingCount} one="# pending" other="# pending" />
              </span>
            </div>
            <button className="manage-items-button" onClick={onManageItems} type="button">
              <span>
                <strong><Trans>Open item manager</Trans></strong>
                <small><Trans>Add, review, and remove estimation items</Trans></small>
              </span>
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </section>

          <section className="settings-group">
            <div className="settings-title">
              <div>
                <h3><Trans>Planning deck</Trans></h3>
                <p><Trans>Add, remove, or reorder the cards used in this room.</Trans></p>
              </div>
              <button className="text-button" disabled={editingDisabled} onClick={resetDeck} type="button">
                <Trans>Reset deck</Trans>
              </button>
            </div>
            <DndContext
              collisionDetection={closestCenter}
              onDragEnd={reorderCards}
              sensors={sensors}
            >
              <SortableContext items={cards} strategy={rectSortingStrategy}>
                <div className="card-editor">
                  {cards.map((card) => (
                    <SortableCard
                      card={card}
                      disabled={editingDisabled}
                      key={card}
                      onRemove={() => setCards(cards.filter((value) => value !== card))}
                      removable={cards.length > 2}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <form className="add-card-row" onSubmit={addCard}>
              <input
                disabled={editingDisabled}
                maxLength={12}
                onChange={(event) => setNewCard(event.target.value)}
                placeholder={t`New card`}
                value={newCard}
              />
              <button className="secondary-button" disabled={editingDisabled} type="submit"><Trans>Add card</Trans></button>
            </form>
          </section>

          <section className="settings-group">
            <div className="settings-title">
              <div>
                <h3><Trans>Suggested estimate</Trans></h3>
                <p><Trans>Choose how the app turns the revealed votes into a starting point.</Trans></p>
              </div>
            </div>
            <div className="algorithm-options">
              {SUGGESTION_ALGORITHMS.map((option) => (
                <label className={algorithm === option.id ? "selected" : ""} key={option.id}>
                  <input
                    checked={algorithm === option.id}
                    disabled={editingDisabled}
                    name="algorithm"
                    onChange={() => setAlgorithm(option.id)}
                    type="radio"
                  />
                  <span>
                    <strong>{algorithmName(option)}</strong>
                    <small>{algorithmDescription(option)}</small>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="settings-group settings-row">
            <div>
              <h3><Trans>Reveal reminder</Trans></h3>
              <p><Trans>Signal when it may be time to turn the cards over.</Trans></p>
            </div>
            <select disabled={editingDisabled} onChange={(event) => setTimer(event.target.value)} value={timer}>
              {REVEAL_DELAY_OPTIONS.map((option) => (
                <option key={option.seconds} value={option.seconds}>{revealDelayLabel(option)}</option>
              ))}
            </select>
          </section>

          <section className="settings-group settings-row">
            <div>
              <h3><Trans>Auto-reveal</Trans></h3>
              <p><Trans>Turn the cards over automatically once everyone has voted.</Trans></p>
            </div>
            <label className="switch-control">
              <input
                checked={autoReveal}
                disabled={editingDisabled}
                onChange={(event) => setAutoReveal(event.target.checked)}
                type="checkbox"
              />
              <span />
            </label>
          </section>

          <section className="settings-group settings-row">
            <div>
              <h3><Trans>Confirm votes</Trans></h3>
              <p><Trans>Ask each person to confirm their card before it counts. Turn this off to lock a vote as soon as a card is picked.</Trans></p>
            </div>
            <label className="switch-control">
              <input
                checked={confirmVotes}
                disabled={editingDisabled}
                onChange={(event) => setConfirmVotes(event.target.checked)}
                type="checkbox"
              />
              <span />
            </label>
          </section>

          <section className="settings-group settings-row">
            <div>
              <h3><Trans>Facilitator votes</Trans></h3>
              <p><Trans>Count the facilitator as a voter. Turn this off if you run the session without estimating.</Trans></p>
            </div>
            <label className="switch-control">
              <input
                checked={facilitatorVotes}
                disabled={editingDisabled}
                onChange={(event) => setFacilitatorVotes(event.target.checked)}
                type="checkbox"
              />
              <span />
            </label>
          </section>

          <section className="settings-group">
            <div className="settings-title">
              <div>
                <h3><Trans>Team reactions</Trans></h3>
                <p><Trans>Let people signal agreement, uncertainty, breaks, or a wish to speak.</Trans></p>
              </div>
              <label className="switch-control">
                <input
                  checked={reactionsEnabled}
                  disabled={editingDisabled}
                  onChange={(event) => setReactionsEnabled(event.target.checked)}
                  type="checkbox"
                />
                <span />
              </label>
            </div>
            {reactionsEnabled && (
              <>
                <div className="reaction-palette-editor">
                  {REACTION_OPTIONS.filter(({ emoji }) => emoji !== HAND_REACTION).map((option) => {
                    const selected = reactionPalette.includes(option.emoji);
                    return (
                      <button
                        className={selected ? "selected" : ""}
                        disabled={editingDisabled}
                        key={option.emoji}
                        onClick={() => {
                          if (selected && reactionPalette.length === 1) return;
                          setReactionPalette(
                            selected
                              ? reactionPalette.filter((reaction) => reaction !== option.emoji)
                              : [...reactionPalette, option.emoji],
                          );
                        }}
                        title={reactionLabel(option.emoji, option.label)}
                        type="button"
                      >
                        <strong>{option.emoji}</strong>
                        <small>{reactionLabel(option.emoji, option.label)}</small>
                      </button>
                    );
                  })}
                </div>
                <div className="reaction-admin-actions">
                  <button
                    className="secondary-button"
                    disabled={room.isClosed}
                    onClick={() => send({
                      type: "set_reactions_muted",
                      muted: !room.settings.reactionsMuted,
                    })}
                    type="button"
                  >
                    {room.settings.reactionsMuted ? <Trans>Resume reactions</Trans> : <Trans>Pause reactions</Trans>}
                  </button>
                  <button
                    className="secondary-button"
                    disabled={room.isClosed}
                    onClick={() => send({ type: "clear_reactions" })}
                    type="button"
                  >
                    <Trans>Clear reactions</Trans>
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="settings-group access-settings">
            <div>
              <h3><Trans>Room access</Trans></h3>
              <p>
                {room.isLocked
                  ? <Trans>New participants cannot join. Existing participants can reconnect.</Trans>
                  : <Trans>Anyone with the link can currently join.</Trans>}
              </p>
            </div>
            <button
              className="secondary-button"
              disabled={room.isClosed}
              onClick={() => send({ type: "set_room_lock", locked: !room.isLocked })}
              type="button"
            >
              {room.isLocked ? <Trans>Unlock room</Trans> : <Trans>Lock room</Trans>}
            </button>
          </section>

          <section className="settings-group">
            <div className="settings-title">
              <div>
                <h3><Trans>Facilitator recovery link</Trans></h3>
                <p><Trans>Reclaims this room if you lose this browser or switch devices. Keep it to yourself.</Trans></p>
              </div>
              <button className="secondary-button" onClick={regenerateRecovery} type="button">
                <Trans>Generate a new link</Trans>
              </button>
            </div>
            {issuedRecoveryLink && (
              <div className="issued-recovery">
                <p>
                  <Trans>
                    Copy it now. It replaces any link you saved before, and it will not be
                    shown again.
                  </Trans>
                </p>
                <code>{issuedRecoveryLink}</code>
                <button className="stripe-copy" onClick={copyRecoveryLink} type="button">
                  {recoveryCopied ? <Trans>Copied</Trans> : <Trans>Copy recovery link</Trans>}
                </button>
              </div>
            )}
          </section>

          <section className="danger-zone">
            <div className="danger-action">
              <div>
                <h3><Trans>Close room</Trans></h3>
                <p><Trans>Make this session read-only until it expires.</Trans></p>
              </div>
              <button className="danger-button" disabled={editingDisabled} onClick={closeRoom} type="button">
                <Trans>Close room</Trans>
              </button>
            </div>
            <div className="danger-action delete">
              <div>
                <h3><Trans>Delete room</Trans></h3>
                <p><Trans>Immediately erase the room and all of its data.</Trans></p>
              </div>
              <button className="danger-button solid" onClick={deleteRoom} type="button">
                <Trans>Delete room</Trans>
              </button>
            </div>
          </section>
        </div>

        <footer>
          <button className="secondary-button" onClick={onClose} type="button"><Trans>Cancel</Trans></button>
          <button className="primary-button" disabled={editingDisabled || cards.length < 2} onClick={save} type="button">
            {room.isClosed ? <Trans>Room closed</Trans> : <Trans>Save settings</Trans>}
          </button>
        </footer>
        {confirmationDialog}
      </section>
    </div>
  );
}

function SortableCard({ card, disabled, onRemove, removable }) {
  const { t } = useLingui();
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: card, disabled });

  return (
    <div
      className={`editable-card ${isDragging ? "dragging" : ""}`}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        className="drag-handle"
        disabled={disabled}
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t`Drag to reorder ${card}`}
      >
        <GripVertical size={14} aria-hidden="true" />
      </button>
      <strong>{card}</strong>
      <button
        className="remove-card"
        disabled={disabled || !removable}
        onClick={onRemove}
        type="button"
        aria-label={t`Remove ${card}`}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
