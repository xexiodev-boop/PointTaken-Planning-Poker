import { t } from "@lingui/core/macro";
import { useCallback, useEffect, useRef, useState } from "react";
import { ROOM_ID_PATTERN } from "../shared/roomId.js";
import { JoinRoom, LoadingRoom, RecoveryPrompt } from "./components/EntryScreens.jsx";
import { HomePage } from "./components/HomePage.jsx";
import { NotFoundPage } from "./components/NotFoundPage.jsx";
import { PrivacyPage } from "./components/PrivacyPage.jsx";
import { Room } from "./components/room/Room.jsx";
import { api } from "./lib/api.js";
import { forgetRoom, rememberRoom } from "./lib/recentRoom.js";
import { localizeAnnouncement, localizeServerMessage } from "./lib/serverMessages.js";

const ROOM_PATH = new RegExp(`^/room/(${ROOM_ID_PATTERN})/?$`);
function useRoomId() {
  return window.location.pathname.match(ROOM_PATH)?.[1] ?? null;
}

export default function App() {
  const roomId = useRoomId();
  if (roomId) return <RoomPage roomId={roomId} />;
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/privacy") return <PrivacyPage />;
  if (path === "/") return <HomePage />;
  // A /room/... path reaching here failed ROOM_PATH, so the id is malformed.
  return <NotFoundPage reason={path.startsWith("/room") ? "room" : "page"} />;
}

function readRecoveryCode() {
  return new URLSearchParams(window.location.search).get("recover");
}

function RoomPage({ roomId }) {
  const [access, setAccess] = useState("checking");
  const [gone, setGone] = useState(null);
  const [room, setRoom] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [issuedRecoveryCode, setIssuedRecoveryCode] = useState(null);
  // A recovery link is a facilitator credential, not an invite, and people do
  // share it by mistake. Redeeming it rotates the creator's token and unseats
  // whoever is facilitating, so ask before spending it: null means the prompt
  // is still open, "" means proceed as a normal visitor, and a code means the
  // visitor chose to take facilitation over.
  const [recoveryDecision, setRecoveryDecision] = useState(() => (readRecoveryCode() ? null : ""));
  const socketRef = useRef(null);

  useEffect(() => {
    if (!error || access === "join") return undefined;
    const timer = window.setTimeout(() => setError(""), 5000);
    return () => window.clearTimeout(timer);
  }, [access, error]);

  useEffect(() => {
    if (room) rememberRoom(room);
  }, [room]);

  useEffect(() => {
    // Hold everything back while the recovery prompt is open: connecting first
    // would join the room under the visitor's own identity and race the
    // token rotation that redeeming performs.
    if (recoveryDecision === null) return undefined;
    let cancelled = false;
    let retryTimer;
    let retryCount = 0;

    function connect(isRetry = false) {
      setStatus(isRetry ? "reconnecting" : "connecting");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${window.location.host}/api/rooms/${roomId}/socket`);
      socketRef.current = socket;

      socket.onopen = () => {
        if (!cancelled) {
          retryCount = 0;
          setStatus("connected");
          setError("");
        }
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "state") {
            // Frequent syncs omit the large history payload to save bandwidth;
            // carry our last-known history forward when it isn't included.
            setRoom((previous) =>
              message.room.history === undefined && previous
                ? { ...message.room, history: previous.history }
                : message.room,
            );
          }
          // Sent only to the socket that asked for it, never broadcast. Held in
          // memory and shown once in room settings; nothing persists it.
          if (message.type === "recovery_code") setIssuedRecoveryCode(message.code);
          if (message.type === "error") setError(localizeServerMessage(message.message));
          if (message.type === "announcement") setNotice(localizeAnnouncement(message));
          if (message.type === "room_deleted") {
            forgetRoom(roomId);
            setGone("deleted");
          }
        } catch {
          setError(t`The room sent an unreadable update. Reconnecting may help.`);
        }
      };
      socket.onclose = (event) => {
        if (cancelled) return;
        // Explicit app codes are intentional kicks — act on them immediately.
        if (event.code === 4002) {
          forgetRoom(roomId);
          setGone("deleted");
          return;
        }
        if (event.code === 4001 || event.code === 4003) {
          setError(event.code === 4003
            ? t`Facilitator access was recovered in another browser, so this session was signed out. Join again to keep taking part.`
            : t`You were removed from this room.`);
          setAccess("join");
          setRoom(null);
          setStatus("join");
          return;
        }
        // Any other close (server restart/eviction and browser navigation both
        // use 1001, network drops use 1006, room expiry closes with 1001) is
        // ambiguous: re-check identity via /state before assuming we were kicked,
        // so a still-valid session reconnects instead of landing on the join form.
        recover();
      };
    }

    async function recover() {
      setStatus("reconnecting");
      try {
        const state = await api(`/api/rooms/${roomId}/state`);
        if (cancelled) return;
        setRoom(state);
        setAccess("joined");
        retryCount = 0;
        connect(true);
      } catch (requestError) {
        if (cancelled) return;
        if (requestError.status === 401) {
          // Identity genuinely rejected — the user needs to (re)join.
          setAccess("join");
          setRoom(null);
          setStatus("join");
          return;
        }
        if (requestError.status === 404) {
          forgetRoom(roomId);
          setGone("expired");
          return;
        }
        // Transient failure (still restarting, network blip) — back off and retry.
        const delay = Math.min(15000, 750 * (2 ** retryCount));
        retryCount += 1;
        retryTimer = window.setTimeout(recover, delay + Math.random() * 500);
      }
    }

    async function redeemRecoveryLink() {
      if (!recoveryDecision) return;
      try {
        await api(`/api/rooms/${roomId}/recover`, {
          method: "POST",
          body: JSON.stringify({ code: recoveryDecision }),
        });
        if (!cancelled) setNotice(t`Facilitator access recovered.`);
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      }
    }

    async function authenticate() {
      await redeemRecoveryLink();
      if (cancelled) return;
      try {
        const state = await api(`/api/rooms/${roomId}/state`);
        if (cancelled) return;
        setRoom(state);
        setAccess("joined");
        connect();
      } catch (requestError) {
        if (cancelled) return;
        // 404 means the room is gone; anything else means this browser just
        // has no valid identity for it.
        if (requestError.status === 404) {
          forgetRoom(roomId);
          setGone("expired");
          return;
        }
        setAccess("join");
        setStatus("join");
        if (requestError.status !== 401) setError(requestError.message);
      }
    }

    authenticate();
    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      socketRef.current?.close();
    };
  }, [roomId, recoveryDecision]);

  const send = useCallback((event) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setError(t`The room is reconnecting. Try that again in a moment.`);
      return;
    }
    socketRef.current.send(JSON.stringify(event));
  }, []);

  async function join(name) {
    setStatus("connecting");
    setError("");
    try {
      await api(`/api/rooms/${roomId}/join`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      window.location.reload();
    } catch (requestError) {
      setError(requestError.message);
      setStatus("join");
    }
  }

  function decideRecovery(accepted) {
    const code = readRecoveryCode() ?? "";
    // Strip the secret from the address bar and history either way, so a
    // refresh can't re-prompt and the code can't be copied back out of the URL.
    window.history.replaceState(null, "", `/room/${roomId}`);
    setRecoveryDecision(accepted ? code : "");
  }

  if (gone) return <NotFoundPage reason={gone} />;
  if (recoveryDecision === null) {
    return <RecoveryPrompt roomId={roomId} onDecide={decideRecovery} />;
  }
  if (access === "join") return <JoinRoom roomId={roomId} onJoin={join} error={error} />;
  if (!room) return <LoadingRoom status={status} error={error} />;

  return (
    <Room
      room={room}
      send={send}
      status={status}
      error={error}
      onError={setError}
      notice={notice}
      onNotice={setNotice}
      issuedRecoveryCode={issuedRecoveryCode}
      onClearIssuedRecoveryCode={() => setIssuedRecoveryCode(null)}
    />
  );
}
