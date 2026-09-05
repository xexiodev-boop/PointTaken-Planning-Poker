import { plural } from "@lingui/core/macro";
import { ArrowDown, ChevronRight, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useMemo, useState } from "react";
import { useConfirmation } from "../../hooks/useConfirmation.jsx";

export function RoundStage({ room, send, onManageItems, onCopyInvite, inviteCopied }) {
  const round = room.currentRound;
  const isFacilitator = room.viewer.role === "facilitator";

  if (room.isClosed) {
    return (
      <div className="round-stage empty-stage">
        <div className="stage-message">
          <p className="eyebrow"><Trans>Session complete</Trans></p>
          <h2><Trans>This room is closed</Trans></h2>
          <p><Trans>Its estimates remain available here until the room expires.</Trans></p>
        </div>
      </div>
    );
  }

  if (!round || round.phase === "finalized") {
    return (
      <div className="round-stage empty-stage">
        <div className="table-orbit">
          <span>?</span><span>3</span><span>8</span>
        </div>
        {isFacilitator ? (
          <StartRound
            room={room}
            send={send}
            previousRound={round}
            onManageItems={onManageItems}
            onCopyInvite={onCopyInvite}
            inviteCopied={inviteCopied}
          />
        ) : (
          <div className="stage-message">
            <p className="eyebrow">{round ? <Trans>Estimate saved</Trans> : <Trans>Room is ready</Trans>}</p>
            <h2><Trans>Waiting for the facilitator</Trans></h2>
            <p>
              {round
                ? <Trans>The next task will appear here.</Trans>
                : <Trans>They’ll bring the first task to the table.</Trans>}
            </p>
          </div>
        )}
      </div>
    );
  }

  if (round.phase === "voting") {
    return <VotingStage room={room} send={send} />;
  }

  return <ResultsStage room={room} send={send} />;
}

function StartRound({ room, send, previousRound, onManageItems, onCopyInvite, inviteCopied }) {
  const { t } = useLingui();
  const pendingItems = useMemo(
    () => room.items.filter((item) => item.status === "pending"),
    [room.items],
  );
  const [itemId, setItemId] = useState(pendingItems[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState(pendingItems.length ? "backlog" : "new");
  const selectedItem = pendingItems.find((item) => item.id === itemId);
  const firstPendingId = pendingItems[0]?.id ?? "";
  const selectedIsPending = pendingItems.some((item) => item.id === itemId);
  const voterCount = room.participants.filter((person) => person.eligible).length;

  useEffect(() => {
    if (firstPendingId && !selectedIsPending) {
      setItemId(firstPendingId);
      setSource("backlog");
    } else if (!firstPendingId) {
      setItemId("");
      setSource("new");
    }
  }, [firstPendingId, selectedIsPending]);

  function submit(event) {
    event.preventDefault();
    if (source === "backlog" && itemId) {
      send({ type: "start_round", itemId });
    } else if (title.trim()) {
      send({ type: "start_round", title });
    } else {
      return;
    }
    setTitle("");
  }

  if (voterCount === 0) {
    return (
      <div className="stage-message no-voters">
        <p className="eyebrow"><Trans>Nobody to vote</Trans></p>
        <h2><Trans>There are no voters yet</Trans></h2>
        <p>
          <Trans>
            Invite your team, or wait for them to join. You can also turn the
            facilitator back into a voter in room settings.
          </Trans>
        </p>
        <button className="primary-button" onClick={onCopyInvite} type="button">
          {inviteCopied ? <Trans>Invite link copied</Trans> : <Trans>Copy invite link</Trans>}
        </button>
      </div>
    );
  }

  return (
    <form className="start-round" onSubmit={submit}>
      <div className="round-picker">
        <section className="pending-picker">
          <div className="picker-heading">
            <span><Trans>Pending items</Trans></span>
            <b>{pendingItems.length}</b>
          </div>
          {pendingItems.length ? (
            <div className="picker-list">
              {pendingItems.map((item, index) => (
                <button
                  className={source === "backlog" && itemId === item.id ? "selected" : ""}
                  key={item.id}
                  onClick={() => {
                    setItemId(item.id);
                    setSource("backlog");
                  }}
                  type="button"
                >
                  <small>{String(index + 1).padStart(2, "0")}</small>
                  <span>{item.title}</span>
                  <ChevronRight className="row-chevron" size={16} aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : (
            <div className="picker-empty">
              <p><Trans>No items are waiting to be estimated.</Trans></p>
              <button onClick={onManageItems} type="button">
                <Plus size={15} aria-hidden="true" />
                <Trans>Add items to the estimation queue</Trans>
              </button>
            </div>
          )}
        </section>

        <section className="round-choice">
          <p className="eyebrow">{previousRound ? <Trans>Ready for another?</Trans> : <Trans>First estimate</Trans>}</p>
          <h2><Trans>What are we sizing?</Trans></h2>
          {source === "backlog" && selectedItem ? (
            <div className="selected-backlog-item">
              <small><Trans>Selected from the item list</Trans></small>
              <strong>{selectedItem.title}</strong>
            </div>
          ) : (
            <div className="new-item-entry">
              <label>
                <Trans>New item</Trans>
                <input
                  autoFocus={!pendingItems.length}
                  maxLength={160}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={t`Describe the item to estimate`}
                  value={title}
                />
              </label>
            </div>
          )}
          <div className="round-choice-actions">
            {pendingItems.length > 0 && (
              <button
                className="text-button"
                onClick={() => setSource(source === "new" ? "backlog" : "new")}
                type="button"
              >
                {source === "new" ? <Trans>Choose a pending item</Trans> : <Trans>Enter a new item instead</Trans>}
              </button>
            )}
            <button className="primary-button" type="submit"><Trans>Start voting</Trans></button>
          </div>
        </section>
      </div>
    </form>
  );
}

function VotingStage({ room, send }) {
  const { t } = useLingui();
  const round = room.currentRound;
  const isFacilitator = room.viewer.role === "facilitator";
  const eligible = room.participants.filter((person) => person.eligible);
  const voted = eligible.filter((person) => person.hasVoted).length;
  const allVoted = voted === eligible.length;
  const { confirm, confirmationDialog } = useConfirmation();
  const hasRevealReminder = Boolean(round.revealAvailableAt);
  const [remaining, setRemaining] = useState(() =>
    hasRevealReminder
      ? Math.max(0, Math.ceil((round.revealAvailableAt - Date.now()) / 1000))
      : null,
  );

  useEffect(() => {
    if (!round.revealAvailableAt) {
      setRemaining(null);
      return undefined;
    }
    const timer = window.setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((round.revealAvailableAt - Date.now()) / 1000)));
    }, 500);
    return () => window.clearInterval(timer);
  }, [round.revealAvailableAt]);

  async function reveal() {
    const missing = eligible.length - voted;
    if (missing > 0) {
      const accepted = await confirm({
        title: t`Reveal cards early?`,
        message: plural(missing, {
          one: "# person is still deciding. Their card will appear as missing.",
          other: "# people are still deciding. Their card will appear as missing.",
        }),
        confirmLabel: t`Reveal cards`,
      });
      if (!accepted) return;
    }
    send({ type: "reveal" });
  }

  function showHand() {
    document.getElementById(`voting-hand-${round.id}`)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center",
    });
  }

  const eligibleCount = eligible.length;

  return (
    <div className="round-stage voting-stage">
      <p className="eyebrow"><Trans>Now estimating</Trans></p>
      <h1>{round.title}</h1>
      {isFacilitator && <FacilitatorRoundControls room={room} send={send} />}
      <div className="vote-progress">
        <div>
          <strong><Trans>{voted} of {eligibleCount}</Trans></strong>
          <span><Trans>votes locked</Trans></span>
        </div>
        <div className="progress-track">
          <span style={{ width: `${eligible.length ? (voted / eligible.length) * 100 : 0}%` }} />
        </div>
        {!allVoted && hasRevealReminder && remaining > 0 && <small><Trans>Reveal suggested in {remaining}s</Trans></small>}
        {(allVoted || round.revealAllowed) && <small className="ready-copy"><Trans>Ready to reveal</Trans></small>}
      </div>
      {isFacilitator && (
        <button className="reveal-button" onClick={reveal} type="button">
          <Trans>Reveal cards</Trans>
        </button>
      )}
      {!isFacilitator && (
        <p className="stage-hint">
          {round.ownVote?.confirmed
            ? <Trans>Your vote is locked. You can still choose another card.</Trans>
            : <Trans>Choose your card below.</Trans>}
        </p>
      )}
      {!round.ownVote?.value && room.participants.some(
        (person) => person.id === room.viewer.id && person.eligible,
      ) && (
        <button className="choose-card-cue" onClick={showHand} type="button">
          <Trans>Choose a card</Trans> <ArrowDown size={15} aria-hidden="true" />
        </button>
      )}
      {confirmationDialog}
    </div>
  );
}

function FacilitatorRoundControls({ room, send }) {
  const { t } = useLingui();
  const round = room.currentRound;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(round.title);
  const confirmedVotes = room.participants.filter((person) => person.hasVoted).length;
  const { confirm, confirmationDialog } = useConfirmation();

  function saveTitle(event) {
    event.preventDefault();
    if (!title.trim()) return;
    send({ type: "update_round_title", title });
    setEditing(false);
  }

  async function restartVoting() {
    const message = round.phase === "revealed"
      ? t`Clear every card and ask the team to vote again?`
      : confirmedVotes
        ? plural(confirmedVotes, {
            one: "Clear # confirmed vote and restart the timer?",
            other: "Clear # confirmed votes and restart the timer?",
          })
        : t`Restart this round and its reveal timer?`;
    const accepted = await confirm({
      title: round.phase === "revealed" ? t`Start another ballot?` : t`Clear the current votes?`,
      message,
      confirmLabel: round.phase === "revealed" ? t`Vote again` : t`Clear votes`,
    });
    if (accepted) send({ type: "restart_voting" });
  }

  async function cancelRound() {
    const message = round.itemId
      ? t`Cancel this round? Its votes will be discarded and the item will remain pending.`
      : t`Cancel this round? Its votes and ad-hoc item will be discarded.`;
    const accepted = await confirm({
      title: t`Cancel this round?`,
      message,
      confirmLabel: t`Cancel round`,
      tone: "danger",
    });
    if (accepted) send({ type: "cancel_round" });
  }

  return (
    <div className="round-controls">
      {editing ? (
        <form className="round-title-editor" onSubmit={saveTitle}>
          <input
            autoFocus
            maxLength={160}
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
          <button className="small-action primary" type="submit"><Trans>Save</Trans></button>
          <button
            className="small-action"
            onClick={() => {
              setTitle(round.title);
              setEditing(false);
            }}
            type="button"
          >
            <Trans>Cancel</Trans>
          </button>
        </form>
      ) : (
        <>
          <button className="round-control-button" onClick={() => setEditing(true)} type="button">
            <Pencil size={14} aria-hidden="true" /> <Trans>Edit title</Trans>
          </button>
          <button className="round-control-button" onClick={restartVoting} type="button">
            <RotateCcw size={14} aria-hidden="true" /> {round.phase === "revealed" ? <Trans>Vote again</Trans> : <Trans>Clear votes</Trans>}
          </button>
          <button className="round-control-button danger" onClick={cancelRound} type="button">
            <X size={14} aria-hidden="true" /> <Trans>Cancel round</Trans>
          </button>
        </>
      )}
      {confirmationDialog}
    </div>
  );
}

function ResultsStage({ room, send }) {
  const { t } = useLingui();
  const round = room.currentRound;
  const isFacilitator = room.viewer.role === "facilitator";
  const suggested = round.suggestion?.value ?? "";
  const [finalValue, setFinalValue] = useState(suggested);
  const [seededFrom, setSeededFrom] = useState(suggested);
  // Removing a voter after reveal recomputes the suggestion. Re-seed the field
  // to match, unless the facilitator has typed a value of their own.
  if (suggested !== seededFrom) {
    setSeededFrom(suggested);
    if (finalValue === seededFrom) setFinalValue(suggested);
  }
  const tally = useMemo(() => {
    const counts = new Map();
    room.participants.forEach((participant) => {
      if (participant.vote) counts.set(participant.vote, (counts.get(participant.vote) ?? 0) + 1);
    });
    return [...counts.entries()].sort(
      ([a], [b]) => room.deck.cards.indexOf(a) - room.deck.cards.indexOf(b),
    );
  }, [room.deck.cards, room.participants]);

  return (
    <div className="round-stage results-stage">
      <p className="eyebrow"><Trans>Cards on the table</Trans></p>
      <h1>{round.title}</h1>
      {isFacilitator && <FacilitatorRoundControls room={room} send={send} />}
      <div className="result-cards">
        {room.participants.filter((person) => person.eligible).map((person) => (
          <div className="person-result" key={person.id}>
            <div className="result-card">{person.vote ?? "—"}</div>
            <span style={{ "--person-color": person.color }}>{person.displayName}</span>
          </div>
        ))}
      </div>
      <div className="result-summary">
        <div>
          <span><Trans>Suggested estimate</Trans></span>
          <strong>{round.suggestion?.value ?? t`No signal`}</strong>
          {round.suggestion?.tied && <small><Trans>Split vote · higher tied value shown</Trans></small>}
        </div>
        <div className="tally">
          {tally.map(([value, count]) => <span key={value}>{value} <b>{count}</b></span>)}
        </div>
      </div>
      <ResultMetrics metrics={round.metrics} />
      {isFacilitator && (
        <form
          className="finalize-row"
          onSubmit={(event) => {
            event.preventDefault();
            send({ type: "finalize", value: finalValue });
          }}
        >
          <label>
            <Trans>Final estimate</Trans>
            <input
              maxLength={24}
              onChange={(event) => setFinalValue(event.target.value)}
              placeholder={t`Enter a value`}
              value={finalValue}
            />
          </label>
          <button className="primary-button" type="submit"><Trans>Save estimate</Trans></button>
        </form>
      )}
    </div>
  );
}

function ResultMetrics({ metrics }) {
  const { t } = useLingui();
  if (!metrics) return null;
  const spreadLabel = metrics.low && metrics.high
    ? metrics.low === metrics.high ? metrics.low : `${metrics.low}–${metrics.high}`
    : t`No range`;

  return (
    <div className="result-metrics">
      <div>
        <span><Trans>Agreement</Trans></span>
        <strong>{metrics.consensusPercent}%</strong>
        <small>{metrics.unanimous ? <Trans>Full consensus</Trans> : <Trans>Largest voting group</Trans>}</small>
      </div>
      <div>
        <span><Trans>Vote range</Trans></span>
        <strong>{spreadLabel}</strong>
        <small>
          {metrics.spread
            ? (
              <Plural
                value={metrics.spread}
                one="# deck step apart"
                other="# deck steps apart"
              />
            )
            : <Trans>No numeric spread</Trans>}
        </small>
      </div>
      <div>
        <span><Trans>Cards counted</Trans></span>
        <strong>{metrics.voteCount}</strong>
        <small><Trans>Confirmed votes</Trans></small>
      </div>
    </div>
  );
}
