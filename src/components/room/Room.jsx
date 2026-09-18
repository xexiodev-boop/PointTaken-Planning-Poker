import { Trans, useLingui } from "@lingui/react/macro";
import { Lock, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { describeExpiry } from "../../lib/expiry.js";
import { takeRecoveryCode } from "../../lib/recovery.js";

import { FacilitatorGuide } from "./FacilitatorGuide.jsx";
import { ReactionLayer } from "./ReactionLayer.jsx";
import { CardHand } from "../round/CardHand.jsx";
import { RoundStage } from "../round/RoundStage.jsx";
import { History } from "../panels/History.jsx";
import { ItemManager } from "../panels/ItemManager.jsx";
import { UpNext } from "../panels/UpNext.jsx";
import { PeopleList } from "../panels/PeopleList.jsx";
import { RoomSettings } from "../panels/RoomSettings.jsx";
import { LanguageSwitcher } from "../LanguageSwitcher.jsx";
import { useConfirmation } from "../../hooks/useConfirmation.jsx";
import { SupportBanner } from "../SupportBanner.jsx";

export function Room({
  room,
  send,
  status,
  error,
  onError,
  notice,
  onNotice,
  issuedRecoveryCode,
  onClearIssuedRecoveryCode,
}) {
  const { t } = useLingui();
  const isFacilitator = room.viewer.role === "facilitator";
  const expiry = describeExpiry(room.expiresAt);
  const [copiedTarget, setCopiedTarget] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [presenceNotices, setPresenceNotices] = useState([]);
  const [recoveryCode, setRecoveryCode] = useState(() => takeRecoveryCode(room.id));
  // Both stripes appear together on a freshly created room, then each is
  // dismissed on its own. The invite one is safe to lose: the header keeps an
  // "Invite people" button. The recovery one is shown exactly once.
  const [showInvite, setShowInvite] = useState(recoveryCode !== null);
  const inviteLink = `${window.location.origin}/room/${room.id}`;
  const canReclaim = room.viewer.isCreator && !isFacilitator && !room.isClosed;
  const currentFacilitatorName = room.participants.find(
    (person) => person.role === "facilitator",
  )?.displayName ?? "";
  const recoveryLink = `${inviteLink}?recover=${recoveryCode ?? ""}`;
  const previousPeopleRef = useRef(null);
  const timersRef = useRef(new Set());
  const { confirm, confirmationDialog } = useConfirmation();

  const scheduleTimeout = useCallback((callback, delay) => {
    const id = window.setTimeout(() => {
      timersRef.current.delete(id);
      callback();
    }, delay);
    timersRef.current.add(id);
    return id;
  }, []);

  // Clear any pending UI timers if the room unmounts (navigation, room deleted)
  // so their deferred setState calls don't run against a torn-down component.
  useEffect(() => () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current.clear();
  }, []);

  // Regenerating retires the code the creation stripe is showing, so drop the
  // stripe rather than leaving a dead link on screen. The new one is presented
  // in room settings, where the facilitator asked for it.
  useEffect(() => {
    if (issuedRecoveryCode) setRecoveryCode(null);
  }, [issuedRecoveryCode]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => onNotice(""), 6000);
    return () => window.clearTimeout(timer);
  }, [notice, onNotice]);

  useEffect(() => {
    const currentPeople = new Map(room.participants.map((person) => [person.id, person]));
    const previousPeople = previousPeopleRef.current;
    previousPeopleRef.current = currentPeople;
    if (!previousPeople) return;

    const events = [];
    for (const person of room.participants) {
      if (person.id === room.viewer.id) continue;
      const previous = previousPeople.get(person.id);
      if (person.connected && (!previous || !previous.connected)) {
        events.push({ person, kind: "joined" });
      } else if (!person.connected && previous?.connected) {
        events.push({ person, kind: "left" });
      }
    }
    for (const [id, person] of previousPeople) {
      if (id !== room.viewer.id && !currentPeople.has(id)) {
        events.push({ person, kind: "left" });
      }
    }

    events.forEach(({ person, kind }) => {
      const id = crypto.randomUUID();
      setPresenceNotices((notices) => [...notices.slice(-3), { id, person, kind }]);
      scheduleTimeout(() => {
        setPresenceNotices((notices) => notices.filter((notice) => notice.id !== id));
      }, 3500);
    });
  }, [room.participants, room.viewer.id, scheduleTimeout]);

  async function copyLink(text, target, failureMessage) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTarget(target);
      scheduleTimeout(
        () => setCopiedTarget((current) => (current === target ? null : current)),
        1600,
      );
    } catch {
      onError(failureMessage);
    }
  }

  async function reclaimFacilitation() {
    const accepted = await confirm({
      title: t`Take facilitation back?`,
      message: t`You created this room. ${currentFacilitatorName} stops being the facilitator, and everyone in the room is told.`,
      confirmLabel: t`Take it back`,
      cancelLabel: t`Leave it`,
    });
    if (!accepted) return;
    send({ type: "reclaim_facilitator" });
  }

  return (
    <main className="room-shell">
      <SupportBanner />
      <header className="room-header">
        <a className="brand" href="/">
          <span className="brand-mark">P</span>
          <span>Point Taken</span>
        </a>
        <div className="room-identity">
          <div>
            <span className="status-dot" data-status={status} />
            <strong>{room.name}</strong>
            {(room.isLocked || room.isClosed) && (
              <span className={`room-state ${room.isClosed ? "closed" : ""}`}>
                {room.isClosed ? <Trans>Closed</Trans> : <Trans>Locked</Trans>}
              </span>
            )}
            <span className={`room-expiry ${expiry.near ? "warn" : ""}`} title={t`Rooms expire after 7 days of inactivity. Any activity keeps them alive.`}>
              {expiry.label}
            </span>
          </div>
          <button
            className="text-button"
            onClick={() => copyLink(
              inviteLink,
              "header",
              t`The invite link could not be copied. Copy it from the address bar instead.`,
            )}
            type="button"
          >
            {copiedTarget === "header" ? <Trans>Link copied</Trans> : <Trans>Invite people</Trans>}
          </button>
          {canReclaim && (
            <button className="text-button reclaim" onClick={reclaimFacilitation} type="button">
              <Trans>Take facilitation back</Trans>
            </button>
          )}
          {isFacilitator && (
            <>
              {!room.isClosed && (
                <button className="text-button" onClick={() => setGuideOpen(true)} type="button">
                  <Trans>Quick guide</Trans>
                </button>
              )}
              <button className="text-button" onClick={() => setSettingsOpen(true)} type="button">
                <Trans>Room settings</Trans>
              </button>
            </>
          )}
        </div>
        <div className="viewer-cluster">
          <LanguageSwitcher iconOnly />
          <div className="viewer-pill">
            <span style={{ backgroundColor: room.viewer.color }} />
            <div>
              <strong>{room.viewer.displayName}</strong>
              <small>{isFacilitator ? <Trans>Facilitator</Trans> : <Trans>Participant</Trans>}</small>
            </div>
          </div>
        </div>
      </header>

      {/* Post-creation notices as full-width stripes under the header, in the
          same vein as the support banner. Each carries its own close button, so
          dismissing one never silently takes the other with it. */}
      {isFacilitator && showInvite && (
        <div className="launch-stripe invite" role="note">
          <strong><Trans>Invite your team</Trans></strong>
          <code>{inviteLink}</code>
          <button
            className="stripe-copy"
            onClick={() => copyLink(
              inviteLink,
              "invite",
              t`The invite link could not be copied. Copy it from the address bar instead.`,
            )}
            type="button"
          >
            {copiedTarget === "invite" ? <Trans>Copied</Trans> : <Trans>Copy invite link</Trans>}
          </button>
          <button
            aria-label={t`Dismiss the invite reminder`}
            className="stripe-close"
            onClick={() => setShowInvite(false)}
            type="button"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      {isFacilitator && recoveryCode && (
        <div className="launch-stripe secret" role="note">
          <strong>
            <Lock size={14} aria-hidden="true" />
            <Trans>Your recovery link</Trans>
          </strong>
          <span className="launch-hint">
            <Trans><strong>Only for you</strong>, not for your team. Shown once.</Trans>
          </span>
          <code>{recoveryLink}</code>
          <button
            className="stripe-copy"
            onClick={() => copyLink(
              recoveryLink,
              "recovery",
              t`Couldn’t copy automatically. Select and copy the link manually.`,
            )}
            type="button"
          >
            {copiedTarget === "recovery" ? <Trans>Copied</Trans> : <Trans>Copy recovery link</Trans>}
          </button>
          <button
            aria-label={t`Dismiss the recovery link`}
            className="stripe-close"
            onClick={() => setRecoveryCode(null)}
            type="button"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      {error && (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button aria-label={t`Dismiss message`} onClick={() => onError("")} type="button"><X size={16} aria-hidden="true" /></button>
        </div>
      )}
      {notice && (
        <div className="toast notice" role="status">
          <span>{notice}</span>
          <button aria-label={t`Dismiss message`} onClick={() => onNotice("")} type="button"><X size={16} aria-hidden="true" /></button>
        </div>
      )}
      <div className="presence-notifications" aria-live="polite">
        {presenceNotices.map((notice) => (
          <div className={`presence-notice ${notice.kind}`} key={notice.id}>
            <span style={{ backgroundColor: notice.person.color }}>
              {notice.person.displayName.charAt(0).toUpperCase()}
            </span>
            <div>
              <strong>{notice.person.displayName}</strong>
              <small>{notice.kind === "joined" ? <Trans>joined the room</Trans> : <Trans>left the room</Trans>}</small>
            </div>
          </div>
        ))}
      </div>
      {settingsOpen && (
        <RoomSettings
          room={room}
          send={send}
          issuedRecoveryCode={issuedRecoveryCode}
          onError={onError}
          onClose={() => {
            setSettingsOpen(false);
            // The new secret lives only in memory; drop it when the panel that
            // shows it closes rather than leaving it in state indefinitely.
            onClearIssuedRecoveryCode();
          }}
          onManageItems={() => {
            setSettingsOpen(false);
            setItemsOpen(true);
          }}
        />
      )}
      {itemsOpen && (
        <ItemManager
          room={room}
          send={send}
          error={error}
          onClose={() => setItemsOpen(false)}
        />
      )}
      {guideOpen && (
        <FacilitatorGuide
          onClose={() => setGuideOpen(false)}
          onManageItems={() => {
            setGuideOpen(false);
            setItemsOpen(true);
          }}
          onCopyInvite={() => copyLink(
            inviteLink,
            "guide",
            t`The invite link could not be copied. Copy it from the address bar instead.`,
          )}
          inviteCopied={copiedTarget === "guide"}
        />
      )}

      <div className="room-layout">
        <section className="table-area">
          <RoundStage
            room={room}
            send={send}
            onManageItems={() => setItemsOpen(true)}
            onCopyInvite={() => copyLink(
              inviteLink,
              "stage",
              t`The invite link could not be copied. Copy it from the address bar instead.`,
            )}
            inviteCopied={copiedTarget === "stage"}
          />
          <CardHand room={room} send={send} />
        </section>
        <aside className="sidebar">
          <PeopleList room={room} send={send} />
          <UpNext room={room} send={send} onManageItems={() => setItemsOpen(true)} />
          <History room={room} />
        </aside>
      </div>
      <ReactionLayer room={room} send={send} />
      {confirmationDialog}
    </main>
  );
}
