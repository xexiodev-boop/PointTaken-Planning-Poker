import { SUGGESTION_ALGORITHM_IDS } from "../shared/algorithms.js";
import { getDeck } from "../shared/decks.js";
import { eligibleVoters, isEligibleVoter } from "../shared/eligibility.js";
import { ROOM_LIMITS } from "../shared/limits.js";
import { FACILITATOR_ONLY, LIMIT_MESSAGES } from "../shared/messages.js";
import { DEFAULT_REACTION_PALETTE, HAND_REACTION } from "../shared/reactions.js";
import { ALLOWED_REVEAL_DELAYS as REVEAL_DELAY_SECONDS, DEFAULT_REVEAL_DELAY_SECONDS } from "../shared/reveal.js";
import { ROOM_ID_PATTERN } from "../shared/roomId.js";
import {
  byteLength,
  calculateResultMetrics,
  calculateSuggestion,
  cleanCards,
  readJson,
  ValidationError,
} from "./room-logic.js";

const ROOM_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
// How long the facilitator can be disconnected before the room auto-transfers
// facilitation to the longest-tenured connected participant, so a dropped
// facilitator can't strand a live session.
const FACILITATOR_GRACE_MS = 5 * 60 * 1000;
const CURRENT_SCHEMA_VERSION = 1;
const IDENTITY_COOKIE = "point_taken_identity";
const REACTION_COOLDOWN_MS = 1200;
const REACTION_LIFETIME_MS = 5000;
const ALLOWED_REACTIONS = new Set([...DEFAULT_REACTION_PALETTE, HAND_REACTION]);
const ALLOWED_REVEAL_DELAYS = new Set(REVEAL_DELAY_SECONDS);
const ALLOWED_SUGGESTION_ALGORITHMS = new Set(SUGGESTION_ALGORITHM_IDS);
const COLORS = [
  "#ef6a5b",
  "#5b8def",
  "#20a77a",
  "#a36be2",
  "#e59b2f",
  "#db5f9a",
  "#3e9aa6",
  "#7e8c45",
  "#7e2042",
  "#3250a0",
  "#7fcbdc",
];
const ADJECTIVES = ["Brisk", "Bright", "Calm", "Clever", "Merry", "Nimble", "Quiet", "Swift", "Happy", "Kind", "Nocturnal", "Honest", "Brave"];
const COLORS_AS_WORDS = ["Amber", "Azure", "Coral", "Indigo", "Jade", "Lilac", "Silver", "Violet", "Gold", "Crimson"];
const ANIMALS = ["Badger", "Falcon", "Fox", "Koala", "Otter", "Panda", "Raven", "Tiger", "Whale", "Zebra", "Hedgehog", "Elephant", "Penguin", "Dolphin", "Giraffe", "Kangaroo", "Lemur", "Meerkat", "Owl", "Seal", "Capybara", "Wombat", "Armadillo", "Chameleon", "Iguana", "Sloth", "Tortoise", "Walrus", "Yak", "Flamingo"];

function json(data, status = 200) {
  return Response.json(data, { status });
}

function cookieValue(request, name) {
  const cookies = request.headers.get("Cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

function identityCookie(token, roomId, secure) {
  const parts = [
    `${IDENTITY_COOKIE}=${encodeURIComponent(token)}`,
    `Path=/api/rooms/${roomId}`,
    `Max-Age=${Math.floor(ROOM_LIFETIME_MS / 1000)}`,
    "HttpOnly",
    "SameSite=Strict",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function withSecurityHeaders(response) {
  const next = new Response(response.body, response);
  next.headers.set(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  );
  next.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next.headers.set("X-Content-Type-Options", "nosniff");
  next.headers.set("Referrer-Policy", "no-referrer");
  next.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next.headers.set("Cache-Control", "no-store");
  return next;
}

function validateOrigin(request, requestUrl, env) {
  const origin = request.headers.get("Origin");
  const allowed = new Set([requestUrl.origin]);
  if (env.ALLOWED_ORIGIN) allowed.add(env.ALLOWED_ORIGIN);
  return Boolean(origin && allowed.has(origin));
}

// A room's id is also its join credential (the room URL), so it must never
// appear in logs. Replace it with a short one-way tag: events for the same
// room stay correlatable, but the tag cannot be turned back into a room link.
function roomTag(roomId) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < roomId.length; index += 1) {
    hash ^= roomId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function safeLog(event, details = {}) {
  const { roomId, ...rest } = details;
  console.log(roomId ? { event, room: roomTag(roomId), ...rest } : { event, ...rest });
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomHex(length = 5) {
  const bytes = crypto.getRandomValues(new Uint8Array(Math.ceil(length / 2)));
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, length);
}

function randomRoomName() {
  return `${randomItem(ADJECTIVES)} ${randomItem(COLORS_AS_WORDS)} ${randomItem(ANIMALS)}`;
}

function roomSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function randomRoomId(name) {
  return `${roomSlug(name)}-${randomHex(6)}`;
}

// Collapse whitespace, then strip control (Cc) and format (Cf) characters —
// zero-width joiners, bidi overrides, etc. — that would otherwise let a value
// render as visually empty or reorder the text displayed around it. Whitespace
// is collapsed first so tabs/newlines become a space rather than vanishing
// (they are Cc and would otherwise be deleted, gluing words together).
function stripInvisible(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .trim();
}

export function cleanName(value) {
  return stripInvisible(value).slice(0, 32) || "Guest";
}

function cleanTitle(value) {
  return stripInvisible(value).slice(0, 160);
}

function cleanItemTitles(values) {
  if (!Array.isArray(values)) throw new Error("Items must be provided as a list.");
  const titles = values.map(cleanTitle).filter(Boolean);
  if (titles.length === 0) throw new Error("Add at least one item.");
  if (titles.length > 100) throw new Error("Add no more than 100 items at a time.");
  return titles;
}

function cloneDeck(deckId) {
  const deck = getDeck(deckId);
  return { ...deck, cards: [...deck.cards] };
}

function newParticipant(name, role, index) {
  return {
    id: crypto.randomUUID(),
    token: crypto.randomUUID(),
    name: cleanName(name),
    suffix: randomHex(),
    color: COLORS[index % COLORS.length],
    role,
    connected: false,
    disconnectedAt: null,
    joinedAt: Date.now(),
  };
}

function displayName(participant) {
  return `${participant.name} - ${participant.suffix}`;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Constant-time comparison of two equal-length hex strings, so validating a
// recovery code can't be probed via response timing.
function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

// When the facilitator drops out, pick who inherits the role: the
// longest-tenured connected member, preferring voting participants over
// observers. Returns null when nobody else is connected to hand off to.
export function chooseFacilitatorSuccessor(participants, facilitatorId) {
  return participants
    .filter((person) => person.id !== facilitatorId && person.connected)
    .sort((a, b) => {
      const aObserver = a.role === "observer" ? 1 : 0;
      const bObserver = b.role === "observer" ? 1 : 0;
      if (aObserver !== bObserver) return aObserver - bObserver;
      return a.joinedAt - b.joinedAt;
    })[0] ?? null;
}

function findParticipantByToken(room, token) {
  return room.participants.find((participant) => participant.token === token);
}

function requireFacilitator(participant, message) {
  if (participant.role !== "facilitator") {
    throw new Error(message);
  }
}

function requireBetweenRounds(room, message) {
  if (room.currentRound && room.currentRound.phase !== "finalized") {
    throw new Error(message);
  }
}

function everyoneConfirmed(round, participants) {
  const eligible = round.eligibleParticipantIds.filter((id) =>
    participants.some((person) => person.id === id),
  );
  // An empty eligible list must not vacuously satisfy `.every()` — a round with
  // no remaining voters is not "everyone confirmed".
  if (eligible.length === 0) return false;
  return eligible.every((id) => round.votes[id]?.confirmed);
}

// Turn a voting round face-up, computing the suggestion and result metrics.
// Shared by the manual `reveal` action and the auto-reveal path so both produce
// an identical revealed state.
function revealRound(room, round) {
  round.phase = "revealed";
  round.revealedAt = Date.now();
  round.suggestion = calculateSuggestion(round, room.deck, room.settings.suggestionAlgorithm);
  round.metrics = calculateResultMetrics(round, room.deck);
}

// /room/:id is the only page URL that cannot be a static asset, so
// run_worker_first routes it here. Anything else that arrives is a dead URL.
const ROOM_ROUTE = new RegExp(`^/room/(?:${ROOM_ID_PATTERN})$`);

async function serveAppShell(env, url) {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const known = ROOM_ROUTE.test(path);
  // Via the assets binding so the shells keep their `_headers` rules; the
  // API-only headers applied elsewhere in this file would break their CSP.
  const shell = new Request(new URL(known ? "/index.html" : "/404.html", url));
  const asset = await env.ASSETS.fetch(shell);
  if (known) return asset;
  return new Response(asset.body, { status: 404, headers: asset.headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (!url.pathname.startsWith("/api/")) {
        return serveAppShell(env, url);
      }
      if (url.pathname === "/api/rooms" && request.method === "POST") {
        if (!validateOrigin(request, url, env)) {
          safeLog("origin_rejected", { action: "create_room" });
          return withSecurityHeaders(json({ error: "Request origin is not allowed." }, 403));
        }
        const actorKey = request.headers.get("CF-Connecting-IP") ?? "local";
        const { success } = await env.CREATE_RATE_LIMITER.limit({ key: actorKey });
        if (!success) {
          safeLog("rate_limited", { action: "create_room" });
          return withSecurityHeaders(json({ error: "Too many rooms created. Try again shortly." }, 429));
        }
        const input = await readJson(request);
        const roomName = randomRoomName();
        const roomId = randomRoomId(roomName);
        const objectId = env.ROOMS.idFromName(roomId);
        const stub = env.ROOMS.get(objectId);
        const response = await stub.fetch("https://room.internal/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId,
            roomName,
            facilitatorName: input.name,
            deckId: input.deckId,
          }),
        });
        const result = await response.json();
        if (!response.ok) return withSecurityHeaders(json(result, response.status));
        const publicResult = {
          roomId: result.roomId,
          participantId: result.participantId,
          recoveryCode: result.recoveryCode,
        };
        const publicResponse = json(publicResult, 201);
        publicResponse.headers.append(
          "Set-Cookie",
          identityCookie(result.token, roomId, url.protocol === "https:"),
        );
        safeLog("room_created", { roomId });
        return withSecurityHeaders(publicResponse);
      }

      const match = url.pathname.match(
        new RegExp(`^/api/rooms/(${ROOM_ID_PATTERN})(?:/(join|recover|socket|state))?$`),
      );
      if (!match) {
        return withSecurityHeaders(json({ error: "Not found" }, 404));
      }

      const [, roomId, action = "state"] = match;
      const isSocket = action === "socket";
      const isMutation = request.method !== "GET";
      if ((isSocket || isMutation) && !validateOrigin(request, url, env)) {
        safeLog("origin_rejected", { action, roomId });
        return withSecurityHeaders(json({ error: "Request origin is not allowed." }, 403));
      }

      const objectId = env.ROOMS.idFromName(roomId);
      const stub = env.ROOMS.get(objectId);
      const target = new URL(`https://room.internal/${action}`);
      const headers = new Headers(request.headers);
      const token = cookieValue(request, IDENTITY_COOKIE);
      // Always overwrite (even to empty) so a client-forged X-Room-Identity
      // header can never reach the Durable Object; the HttpOnly cookie is the
      // only source of identity. Without this, a cookieless join could smuggle
      // a leaked token in via the header.
      headers.set("X-Room-Identity", token ?? "");

      // join and recover both take a JSON body and hand back an identity token
      // to store as the HttpOnly cookie for this browser.
      const isIdentityPost = (action === "join" || action === "recover") && request.method === "POST";

      let forwardedRequest = request;
      if (isIdentityPost) {
        const actorKey = `${roomId}:${request.headers.get("CF-Connecting-IP") ?? "local"}`;
        const { success } = await env.JOIN_RATE_LIMITER.limit({ key: actorKey });
        if (!success) {
          safeLog("rate_limited", { action: `${action}_room`, roomId });
          return withSecurityHeaders(json({ error: "Too many attempts. Try again shortly." }, 429));
        }
        const input = await readJson(request);
        forwardedRequest = new Request(target, {
          method: "POST",
          headers,
          body: JSON.stringify(input),
        });
      } else {
        forwardedRequest = new Request(target, request);
        forwardedRequest.headers.set("X-Room-Identity", token ?? "");
      }

      const response = await stub.fetch(target, forwardedRequest);
      if (isIdentityPost) {
        const result = await response.json();
        if (!response.ok) return withSecurityHeaders(json(result, response.status));
        const publicResponse = json({
          roomId: result.roomId,
          participantId: result.participantId,
        }, response.status);
        publicResponse.headers.append(
          "Set-Cookie",
          identityCookie(result.token, roomId, url.protocol === "https:"),
        );
        safeLog(action === "join" ? "participant_joined" : "facilitator_recovered", { roomId });
        return withSecurityHeaders(publicResponse);
      }
      if (isSocket) return response;
      // Re-issue the identity cookie on a successful state read so its 7-day
      // window slides forward in lock-step with the room's own sliding expiry.
      // Otherwise a daily-used room outlives the fixed-lifetime cookie and the
      // facilitator (and every participant) is silently locked out on day 8.
      if (action === "state" && request.method === "GET" && token && response.ok) {
        const refreshed = withSecurityHeaders(response);
        refreshed.headers.append(
          "Set-Cookie",
          identityCookie(token, roomId, url.protocol === "https:"),
        );
        return refreshed;
      }
      return withSecurityHeaders(response);
    } catch (error) {
      if (error instanceof ValidationError) {
        safeLog("request_rejected", { reason: error.message });
        return withSecurityHeaders(json({ error: error.message }, 400));
      }
      // Genuine internal fault (storage/DO fetch/parse failure). Log the real
      // reason server-side but return a generic 500 so we don't mislabel it as
      // a client error or leak internal error text to the caller.
      safeLog("request_failed", {
        reason: error instanceof Error ? error.message : String(error),
      });
      return withSecurityHeaders(json({ error: "Something went wrong. Please try again." }, 500));
    }
  },
};

export class PlanningRoom {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async loadRoom() {
    const room = await this.ctx.storage.get("room");
    if (!room) return room;
    room.schemaVersion ??= 0;
    room.deck ??= cloneDeck(room.deckId);
    room.settings ??= {};
    room.settings.suggestionAlgorithm ??= "most_votes";
    room.settings.revealDelaySeconds ??= DEFAULT_REVEAL_DELAY_SECONDS;
    room.settings.autoRevealEnabled ??= false;
    room.settings.facilitatorVotes ??= true;
    room.settings.reactionsEnabled ??= true;
    room.settings.reactionPalette ??= [...DEFAULT_REACTION_PALETTE];
    room.settings.reactionPalette = room.settings.reactionPalette.filter(
      (reaction) => reaction !== HAND_REACTION,
    );
    room.settings.reactionsMuted ??= false;
    room.isLocked ??= false;
    room.isClosed ??= false;
    room.items ??= [];
    room.reactions ??= [];
    room.raisedHands ??= [];
    if (room.schemaVersion < CURRENT_SCHEMA_VERSION) {
      room.schemaVersion = CURRENT_SCHEMA_VERSION;
      await this.ctx.storage.put("room", room);
    }
    return room;
  }

  async saveRoom(room, { touch = true } = {}) {
    room.reactions = room.reactions.filter(
      ({ createdAt }) => Date.now() - createdAt < REACTION_LIFETIME_MS,
    );
    if (touch) {
      room.updatedAt = Date.now();
      room.expiresAt = room.updatedAt + ROOM_LIFETIME_MS;
    }
    await this.ctx.storage.put("room", room);
    await this.scheduleNextAlarm(room);
  }

  async scheduleNextAlarm(room) {
    const deadlines = [room.expiresAt];
    if (
      room.currentRound?.phase === "voting" &&
      !room.currentRound.revealAllowed &&
      room.currentRound.revealAvailableAt
    ) {
      deadlines.push(room.currentRound.revealAvailableAt);
    }
    const facilitator = room.participants.find((person) => person.role === "facilitator");
    // Only arm the auto-transfer wake-up when there is actually someone to hand
    // off to — otherwise a leaderless, empty room would re-fire in a tight loop.
    if (
      facilitator &&
      !facilitator.connected &&
      facilitator.disconnectedAt &&
      chooseFacilitatorSuccessor(room.participants, facilitator.id)
    ) {
      deadlines.push(facilitator.disconnectedAt + FACILITATOR_GRACE_MS);
    }
    await this.ctx.storage.setAlarm(Math.min(...deadlines));
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/create" && request.method === "POST") {
      return this.create(request);
    }

    const room = await this.loadRoom();
    if (!room || room.expiresAt <= Date.now()) {
      return json({ error: "This room has expired or does not exist." }, 404);
    }

    if (url.pathname === "/join" && request.method === "POST") {
      return this.join(request, room);
    }

    if (url.pathname === "/recover" && request.method === "POST") {
      return this.recover(request, room);
    }

    if (url.pathname === "/state" && request.method === "GET") {
      const participant = findParticipantByToken(room, request.headers.get("X-Room-Identity"));
      if (!participant) return json({ error: "Invalid room identity." }, 401);
      return json(this.roomView(room, participant));
    }

    if (url.pathname === "/socket" && request.headers.get("Upgrade") === "websocket") {
      return this.connect(request, room);
    }

    return json({ error: "Not found" }, 404);
  }

  async create(request) {
    if (await this.loadRoom()) {
      return json({ error: "Room already exists." }, 409);
    }

    const input = await readJson(request);
    const facilitator = newParticipant(input.facilitatorName, "facilitator", 0);
    // One-time recovery secret. We keep only its hash; the plaintext is returned
    // once so the creator can save a recovery link and reclaim facilitation from
    // any device (also overriding an auto-transfer).
    const recoveryCode = crypto.randomUUID();
    const now = Date.now();
    const room = {
      id: input.roomId,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      name: input.roomName || randomRoomName(),
      deckId: getDeck(input.deckId).id,
      deck: cloneDeck(input.deckId),
      settings: {
        suggestionAlgorithm: "most_votes",
        revealDelaySeconds: DEFAULT_REVEAL_DELAY_SECONDS,
        autoRevealEnabled: false,
        facilitatorVotes: true,
        reactionsEnabled: true,
        reactionPalette: [...DEFAULT_REACTION_PALETTE],
        reactionsMuted: false,
      },
      isLocked: false,
      isClosed: false,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + ROOM_LIFETIME_MS,
      participants: [facilitator],
      creatorParticipantId: facilitator.id,
      creatorName: facilitator.name,
      recoveryCodeHash: await sha256Hex(recoveryCode),
      items: [],
      reactions: [],
      raisedHands: [],
      currentRound: null,
      history: [],
    };

    await this.saveRoom(room);
    return json({
      roomId: room.id,
      token: facilitator.token,
      participantId: facilitator.id,
      recoveryCode,
    }, 201);
  }

  async recover(request, room) {
    const input = await readJson(request);
    const code = String(input.code ?? "");
    if (!room.recoveryCodeHash || !code) {
      return json({ error: "That recovery code is not valid for this room." }, 403);
    }
    const presentedHash = await sha256Hex(code);
    if (!constantTimeEqual(presentedHash, room.recoveryCodeHash)) {
      return json({ error: "That recovery code is not valid for this room." }, 403);
    }

    // Reinstate the creator's original seat, demoting whoever currently holds
    // facilitation (e.g. an auto-transfer successor). Rotate the token so it
    // binds to the recovering browser and any stale copy is invalidated.
    const current = room.participants.find((person) => person.role === "facilitator");
    let creator = room.participants.find((person) => person.id === room.creatorParticipantId);
    if (!creator) {
      creator = newParticipant(room.creatorName ?? "Facilitator", "facilitator", room.participants.length);
      room.creatorParticipantId = creator.id;
      room.participants.push(creator);
    }
    if (current && current.id !== creator.id) current.role = "participant";
    creator.role = "facilitator";
    creator.token = crypto.randomUUID();
    creator.connected = false;
    creator.disconnectedAt = null;

    await this.saveRoom(room, { touch: false });
    await this.announce(room, `${displayName(creator)} recovered facilitator access.`, {
      kind: "facilitator_recovered",
      params: { name: displayName(creator) },
    });
    await this.broadcast(room);
    safeLog("facilitator_recovered", { roomId: room.id });
    return json({
      roomId: room.id,
      token: creator.token,
      participantId: creator.id,
    });
  }

  async join(request, room) {
    const input = await readJson(request);
    const returning = findParticipantByToken(room, request.headers.get("X-Room-Identity"));
    if (returning) {
      return json({
        roomId: room.id,
        token: returning.token,
        participantId: returning.id,
      });
    }

    if (room.isClosed) return json({ error: "This room has been closed." }, 423);
    if (room.isLocked) return json({ error: "This room is not accepting new participants." }, 423);
    if (room.participants.length >= ROOM_LIMITS.participants) {
      return json({ error: LIMIT_MESSAGES.participants }, 409);
    }

    const participant = newParticipant(input.name, "participant", room.participants.length);
    room.participants.push(participant);
    await this.saveRoom(room);
    await this.broadcast(room);

    return json({
      roomId: room.id,
      token: participant.token,
      participantId: participant.id,
    }, 201);
  }

  async connect(request, room) {
    const participant = findParticipantByToken(room, request.headers.get("X-Room-Identity"));
    if (!participant) return json({ error: "Invalid room identity." }, 401);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ token: participant.token, participantId: participant.id });
    this.ctx.acceptWebSocket(server);

    participant.connected = true;
    participant.disconnectedAt = null;
    await this.saveRoom(room, { touch: false });
    server.send(JSON.stringify({ type: "state", room: this.roomView(room, participant) }));
    await this.broadcast(room, { excludeSocket: server });

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket, message) {
    const attachment = socket.deserializeAttachment();
    const room = await this.loadRoom();
    if (!room || !attachment?.token) return;

    const participant = findParticipantByToken(room, attachment.token);
    if (!participant) {
      socket.send(JSON.stringify({ type: "error", message: "Your room identity is no longer valid." }));
      return;
    }

    try {
      const now = Date.now();
      const messageWindowStartedAt = attachment.messageWindowStartedAt ?? now;
      const messageCount = now - messageWindowStartedAt < 10000
        ? (attachment.messageCount ?? 0) + 1
        : 1;
      if (messageCount > 40) throw new Error("Too many room actions. Slow down and try again.");
      socket.serializeAttachment({
        ...attachment,
        messageWindowStartedAt: now - messageWindowStartedAt < 10000 ? messageWindowStartedAt : now,
        messageCount,
      });
      if (
        typeof message !== "string" ||
        byteLength(message) > ROOM_LIMITS.webSocketMessageBytes
      ) {
        throw new Error("Room message is too large.");
      }
      const event = JSON.parse(message);
      if (event.type === "delete_room") {
        requireFacilitator(participant, FACILITATOR_ONLY.deleteRoom);
        for (const connectedSocket of this.ctx.getWebSockets()) {
          try {
            connectedSocket.send(JSON.stringify({ type: "room_deleted" }));
            connectedSocket.close(4002, "Room deleted");
          } catch {
            // The room is being destroyed; disconnected sockets need no further cleanup.
          }
        }
        safeLog("room_deleted", { roomId: room.id });
        await this.ctx.storage.deleteAll();
        return;
      }
      // Handled here rather than in applyAction because the new secret goes to
      // the one socket that asked for it. It must never reach a broadcast or
      // the room view, and only the hash is kept, exactly as at creation.
      // Allowed on a closed room: the facilitator may still need to reclaim it.
      if (event.type === "regenerate_recovery") {
        requireFacilitator(participant, FACILITATOR_ONLY.regenerateRecovery);
        const recoveryCode = crypto.randomUUID();
        room.recoveryCodeHash = await sha256Hex(recoveryCode);
        await this.saveRoom(room);
        socket.send(JSON.stringify({ type: "recovery_code", code: recoveryCode }));
        safeLog("recovery_regenerated", { roomId: room.id });
        return;
      }
      const outcome = await this.applyAction(room, participant, event);
      await this.saveRoom(room);
      if (outcome?.announcement) {
        await this.announce(room, outcome.announcement.message, outcome.announcement.details);
      }
      // finalize is the only action that appends to history, so only then do we
      // pay to broadcast the full history alongside the state.
      await this.broadcast(room, { includeHistory: event.type === "finalize" });
    } catch (error) {
      socket.send(JSON.stringify({
        type: "error",
        message: error instanceof Error ? error.message : "That action could not be completed.",
      }));
    }
  }

  async webSocketClose(socket) {
    const attachment = socket.deserializeAttachment();
    const room = await this.loadRoom();
    if (!room || !attachment?.token) return;

    const participant = findParticipantByToken(room, attachment.token);
    if (!participant) return;

    participant.connected = this.ctx.getWebSockets().some((candidate) => {
      if (candidate === socket) return false;
      return candidate.deserializeAttachment()?.token === participant.token;
    });
    // Stamp when the last socket for this participant went away so the alarm can
    // time a facilitator auto-transfer; clear it if another tab keeps them here.
    participant.disconnectedAt = participant.connected ? null : Date.now();
    await this.saveRoom(room, { touch: false });
    await this.broadcast(room);
  }

  async alarm() {
    const room = await this.loadRoom();
    if (!room) return;

    if (room.expiresAt <= Date.now()) {
      safeLog("room_expired", { roomId: room.id });
      // Use the explicit "room is gone" app code (not 1001, which also means
      // infra restart/eviction) so clients send the user home instead of trying
      // to reconnect to a room that no longer exists.
      this.ctx.getWebSockets().forEach((socket) => socket.close(4002, "Room expired"));
      await this.ctx.storage.deleteAll();
      return;
    }

    if (
      room.currentRound?.phase === "voting" &&
      !room.currentRound.revealAllowed &&
      room.currentRound.revealAvailableAt &&
      room.currentRound.revealAvailableAt <= Date.now()
    ) {
      room.currentRound.revealAllowed = true;
      await this.saveRoom(room, { touch: false });
      await this.broadcast(room);
      return;
    }

    const facilitator = room.participants.find((person) => person.role === "facilitator");
    if (
      facilitator &&
      !facilitator.connected &&
      facilitator.disconnectedAt &&
      Date.now() - facilitator.disconnectedAt >= FACILITATOR_GRACE_MS
    ) {
      const successor = chooseFacilitatorSuccessor(room.participants, facilitator.id);
      if (successor) {
        facilitator.role = "participant";
        successor.role = "facilitator";
        await this.saveRoom(room, { touch: false });
        await this.announce(
          room,
          `${displayName(facilitator)} was away, so ${displayName(successor)} is now the facilitator.`,
          {
            kind: "facilitator_auto_transferred",
            params: { from: displayName(facilitator), to: displayName(successor) },
          },
        );
        await this.broadcast(room);
        safeLog("facilitator_auto_transferred", { roomId: room.id });
        return;
      }
    }

    await this.scheduleNextAlarm(room);
  }

  async applyAction(room, participant, event) {
    const deck = room.deck;

    if (room.isClosed) throw new Error("This room is closed and can only be viewed.");

    switch (event.type) {
      case "update_settings": {
        requireFacilitator(participant, FACILITATOR_ONLY.changeSettings);
        requireBetweenRounds(room, "Room settings can only change between rounds.");

        if (event.cards) room.deck.cards = cleanCards(event.cards);
        if (event.suggestionAlgorithm) {
          if (!ALLOWED_SUGGESTION_ALGORITHMS.has(event.suggestionAlgorithm)) {
            throw new Error("Unknown suggestion algorithm.");
          }
          room.settings.suggestionAlgorithm = event.suggestionAlgorithm;
        }
        if (event.revealDelaySeconds !== undefined) {
          const delay = Number(event.revealDelaySeconds);
          if (!ALLOWED_REVEAL_DELAYS.has(delay)) throw new Error("Unsupported reveal timer.");
          room.settings.revealDelaySeconds = delay;
        }
        if (event.autoRevealEnabled !== undefined) {
          room.settings.autoRevealEnabled = Boolean(event.autoRevealEnabled);
        }
        if (event.facilitatorVotes !== undefined) {
          room.settings.facilitatorVotes = Boolean(event.facilitatorVotes);
        }
        if (event.reactionsEnabled !== undefined) {
          room.settings.reactionsEnabled = Boolean(event.reactionsEnabled);
        }
        if (event.reactionPalette !== undefined) {
          if (!Array.isArray(event.reactionPalette)) throw new Error("Reaction palette must be a list.");
          const palette = [...new Set(event.reactionPalette)]
            .filter((reaction) => ALLOWED_REACTIONS.has(reaction));
          if (palette.length === 0) throw new Error("Keep at least one reaction available.");
          room.settings.reactionPalette = palette;
        }
        break;
      }

      case "send_reaction": {
        if (!room.settings.reactionsEnabled || room.settings.reactionsMuted) {
          throw new Error("Reactions are currently paused.");
        }
        const reaction = String(event.reaction ?? "");
        if (
          !ALLOWED_REACTIONS.has(reaction) ||
          (reaction !== HAND_REACTION && !room.settings.reactionPalette.includes(reaction))
        ) {
          throw new Error("That reaction is not available.");
        }
        const now = Date.now();
        if (participant.lastReactionAt && now - participant.lastReactionAt < REACTION_COOLDOWN_MS) {
          throw new Error("Give reactions a moment to breathe.");
        }
        participant.lastReactionAt = now;
        if (reaction === HAND_REACTION) {
          if (!room.raisedHands.includes(participant.id)) room.raisedHands.push(participant.id);
        } else {
          room.reactions = room.reactions
            .filter(({ createdAt }) => now - createdAt < REACTION_LIFETIME_MS)
            .concat({
              id: crypto.randomUUID(),
              participantId: participant.id,
              reaction,
              createdAt: now,
            })
            .slice(-30);
        }
        break;
      }

      case "lower_hand": {
        room.raisedHands = room.raisedHands.filter((id) => id !== participant.id);
        break;
      }

      case "set_reactions_muted": {
        requireFacilitator(participant, FACILITATOR_ONLY.pauseReactions);
        room.settings.reactionsMuted = Boolean(event.muted);
        break;
      }

      case "clear_reactions": {
        requireFacilitator(participant, FACILITATOR_ONLY.clearReactions);
        room.reactions = [];
        room.raisedHands = [];
        break;
      }

      case "set_room_lock": {
        requireFacilitator(participant, FACILITATOR_ONLY.lockRoom);
        room.isLocked = Boolean(event.locked);
        break;
      }

      case "set_participant_role": {
        requireFacilitator(participant, FACILITATOR_ONLY.changeRoles);
        requireBetweenRounds(room, "Roles can only change between rounds.");
        const target = room.participants.find(({ id }) => id === event.participantId);
        if (!target || target.role === "facilitator") {
          throw new Error("That participant cannot be changed.");
        }
        if (!["participant", "observer"].includes(event.role)) {
          throw new Error("Unknown participant role.");
        }
        target.role = event.role;
        break;
      }

      // Unlike recover(), this must not rotate the creator's token: the
      // request comes from the creator's own session, which rotation signs out.
      case "reclaim_facilitator": {
        if (participant.id !== room.creatorParticipantId) {
          throw new Error("Only the person who created this room can take facilitation back.");
        }
        if (participant.role === "facilitator") {
          throw new Error("You are already the facilitator.");
        }
        const current = room.participants.find((person) => person.role === "facilitator");
        if (current) current.role = "participant";
        participant.role = "facilitator";
        return {
          announcement: {
            message: `${displayName(participant)} took facilitation back.`,
            details: {
              kind: "facilitator_reclaimed",
              params: { name: displayName(participant) },
            },
          },
        };
      }

      case "transfer_facilitator": {
        requireFacilitator(participant, FACILITATOR_ONLY.transferOwnership);
        requireBetweenRounds(room, "Facilitator ownership can only transfer between rounds.");
        const target = room.participants.find(({ id }) => id === event.participantId);
        if (!target || target.id === participant.id) {
          throw new Error("Choose another person to become facilitator.");
        }
        participant.role = "participant";
        target.role = "facilitator";
        break;
      }

      case "remove_participant": {
        requireFacilitator(participant, FACILITATOR_ONLY.removeParticipants);
        const target = room.participants.find(({ id }) => id === event.participantId);
        if (!target || target.role === "facilitator") {
          throw new Error("That participant cannot be removed.");
        }
        room.participants = room.participants.filter(({ id }) => id !== target.id);
        room.raisedHands = room.raisedHands.filter((id) => id !== target.id);
        room.reactions = room.reactions.filter(({ participantId }) => participantId !== target.id);
        if (room.currentRound && room.currentRound.phase !== "finalized") {
          room.currentRound.eligibleParticipantIds =
            room.currentRound.eligibleParticipantIds.filter((id) => id !== target.id);
          delete room.currentRound.votes[target.id];
          if (everyoneConfirmed(room.currentRound, room.participants)) {
            room.currentRound.revealAllowed = true;
            if (room.settings.autoRevealEnabled) revealRound(room, room.currentRound);
          }
          // Removing a voter after reveal changes the vote set, so the
          // suggestion and metrics (agreement, spread) must be recomputed —
          // otherwise the stale values persist and get written into history.
          if (room.currentRound.phase === "revealed") {
            room.currentRound.suggestion = calculateSuggestion(
              room.currentRound,
              deck,
              room.settings.suggestionAlgorithm,
            );
            room.currentRound.metrics = calculateResultMetrics(room.currentRound, deck);
          }
        }
        break;
      }

      case "add_items": {
        requireFacilitator(participant, FACILITATOR_ONLY.addItems);
        requireBetweenRounds(room, "Items can only be changed between rounds.");
        const existingTitles = new Set(
          room.items.filter((item) => item.status === "pending").map((item) => item.title.toLowerCase()),
        );
        const requestedTitles = cleanItemTitles(event.titles);
        const availableSlots = ROOM_LIMITS.pendingItems - existingTitles.size;
        const uniqueNewTitles = requestedTitles.filter((title, index, values) =>
          !existingTitles.has(title.toLowerCase()) &&
          values.findIndex((value) => value.toLowerCase() === title.toLowerCase()) === index,
        );
        if (uniqueNewTitles.length > availableSlots) {
          throw new Error(LIMIT_MESSAGES.pendingItems);
        }
        for (const title of uniqueNewTitles) {
          if (existingTitles.has(title.toLowerCase())) continue;
          room.items.push({
            id: crypto.randomUUID(),
            title,
            status: "pending",
            createdAt: Date.now(),
          });
          existingTitles.add(title.toLowerCase());
        }
        break;
      }

      case "remove_item": {
        requireFacilitator(participant, FACILITATOR_ONLY.removeItems);
        requireBetweenRounds(room, "Items can only be changed between rounds.");
        const item = room.items.find(({ id }) => id === event.itemId);
        if (!item || item.status !== "pending") throw new Error("That pending item was not found.");
        room.items = room.items.filter(({ id }) => id !== item.id);
        break;
      }

      case "update_item": {
        requireFacilitator(participant, FACILITATOR_ONLY.editItems);
        requireBetweenRounds(room, "Items can only be changed between rounds.");
        const item = room.items.find(({ id }) => id === event.itemId);
        if (!item || item.status !== "pending") throw new Error("That pending item was not found.");
        const title = cleanTitle(event.title);
        if (!title) throw new Error("Enter an item title.");
        const duplicate = room.items.some(
          (candidate) =>
            candidate.id !== item.id &&
            candidate.status === "pending" &&
            candidate.title.toLowerCase() === title.toLowerCase(),
        );
        if (duplicate) throw new Error("That item is already in the estimation queue.");
        item.title = title;
        break;
      }

      case "reorder_items": {
        requireFacilitator(participant, FACILITATOR_ONLY.reorderItems);
        requireBetweenRounds(room, "Items can only be reordered between rounds.");
        const pendingItems = room.items.filter(({ status }) => status === "pending");
        const orderedIds = Array.isArray(event.itemIds) ? event.itemIds : [];
        if (
          orderedIds.length !== pendingItems.length ||
          new Set(orderedIds).size !== orderedIds.length ||
          pendingItems.some(({ id }) => !orderedIds.includes(id))
        ) {
          throw new Error("The pending item order is no longer current.");
        }
        const pendingById = new Map(pendingItems.map((item) => [item.id, item]));
        const reordered = orderedIds.map((id) => pendingById.get(id));
        let pendingIndex = 0;
        room.items = room.items.map((item) =>
          item.status === "pending" ? reordered[pendingIndex++] : item,
        );
        break;
      }

      case "close_room": {
        requireFacilitator(participant, FACILITATOR_ONLY.closeRoom);
        requireBetweenRounds(room, "Finish the current round before closing the room.");
        room.isClosed = true;
        room.isLocked = true;
        room.closedAt = Date.now();
        break;
      }

      case "start_round": {
        requireFacilitator(participant, FACILITATOR_ONLY.startRound);
        requireBetweenRounds(room, "Finish the current round first.");
        const selectedItem = event.itemId
          ? room.items.find(({ id, status }) => id === event.itemId && status === "pending")
          : null;
        if (event.itemId && !selectedItem) throw new Error("That item is no longer pending.");
        const title = selectedItem?.title ?? cleanTitle(event.title);
        if (!title) throw new Error("Enter a task title.");
        // A round with no eligible voters can never complete.
        const voters = eligibleVoters(room.participants, room.settings);
        if (voters.length === 0) throw new Error("A round needs at least one voter.");
        const now = Date.now();
        const revealDelayMs = room.settings.revealDelaySeconds * 1000;
        room.currentRound = {
          id: crypto.randomUUID(),
          itemId: selectedItem?.id ?? null,
          title,
          phase: "voting",
          startedAt: now,
          revealAvailableAt: revealDelayMs ? now + revealDelayMs : null,
          revealAllowed: false,
          eligibleParticipantIds: voters.map(({ id }) => id),
          votes: {},
          suggestion: null,
          finalValue: null,
        };
        break;
      }

      case "update_round_title": {
        requireFacilitator(participant, FACILITATOR_ONLY.editItemTitle);
        const round = room.currentRound;
        if (!round || round.phase === "finalized") throw new Error("There is no active round to edit.");
        const title = cleanTitle(event.title);
        if (!title) throw new Error("Enter an item title.");
        round.title = title;
        if (round.itemId) {
          const item = room.items.find(({ id }) => id === round.itemId);
          if (item) item.title = title;
        }
        break;
      }

      case "restart_voting": {
        requireFacilitator(participant, FACILITATOR_ONLY.restartVoting);
        const round = room.currentRound;
        if (!round || round.phase === "finalized") throw new Error("There is no active round to restart.");
        const now = Date.now();
        const revealDelayMs = room.settings.revealDelaySeconds * 1000;
        round.phase = "voting";
        round.startedAt = now;
        round.revealAvailableAt = revealDelayMs ? now + revealDelayMs : null;
        round.revealAllowed = false;
        round.votes = {};
        round.suggestion = null;
        round.revealedAt = null;
        break;
      }

      case "cancel_round": {
        requireFacilitator(participant, FACILITATOR_ONLY.cancelRound);
        const round = room.currentRound;
        if (!round || round.phase === "finalized") throw new Error("There is no active round to cancel.");
        room.currentRound = null;
        break;
      }

      case "select_vote": {
        const round = room.currentRound;
        if (!round || round.phase !== "voting") throw new Error("Voting is not open.");
        if (!round.eligibleParticipantIds.includes(participant.id)) {
          throw new Error("You joined after this round started and can vote in the next one.");
        }
        const value = String(event.value);
        if (!deck.cards.includes(value)) throw new Error("That card is not in this deck.");
        round.votes[participant.id] = { value, confirmed: false, votedAt: Date.now() };
        break;
      }

      case "confirm_vote": {
        const round = room.currentRound;
        const vote = round?.votes[participant.id];
        if (!round || round.phase !== "voting" || !vote) {
          throw new Error("Choose a card before confirming.");
        }
        vote.confirmed = true;
        vote.votedAt = Date.now();
        if (everyoneConfirmed(round, room.participants)) {
          round.revealAllowed = true;
          // Auto-reveal removes the facilitator's most repetitive click: once the
          // last eligible voter confirms, turn the cards over immediately.
          if (room.settings.autoRevealEnabled) revealRound(room, round);
        }
        break;
      }

      case "reveal": {
        requireFacilitator(participant, FACILITATOR_ONLY.revealCards);
        const round = room.currentRound;
        if (!round || round.phase !== "voting") throw new Error("There is no voting round to reveal.");
        revealRound(room, round);
        break;
      }

      case "finalize": {
        requireFacilitator(participant, FACILITATOR_ONLY.finalizeEstimate);
        const round = room.currentRound;
        if (!round || round.phase !== "revealed") throw new Error("Reveal the cards first.");
        const finalValue = String(event.value ?? "").trim();
        if (!finalValue) throw new Error("Choose or enter a final estimate.");
        round.phase = "finalized";
        round.finalValue = finalValue.slice(0, 24);
        round.completedAt = Date.now();
        if (round.itemId) {
          const item = room.items.find(({ id }) => id === round.itemId);
          if (item) {
            item.status = "estimated";
            item.finalValue = round.finalValue;
            item.completedAt = round.completedAt;
          }
        }
        room.history.unshift({
          id: round.id,
          itemId: round.itemId,
          title: round.title,
          startedAt: round.startedAt,
          completedAt: round.completedAt,
          suggestion: round.suggestion,
          metrics: round.metrics,
          deckCards: [...deck.cards],
          suggestionAlgorithm: room.settings.suggestionAlgorithm,
          finalValue: round.finalValue,
          votes: round.eligibleParticipantIds.map((participantId) => {
            const voter = room.participants.find(({ id }) => id === participantId);
            return {
              participantId,
              participantName: voter ? displayName(voter) : "Former participant",
              value: round.votes[participantId]?.value ?? null,
              confirmed: round.votes[participantId]?.confirmed ?? false,
            };
          }),
        });
        room.history = room.history.slice(0, ROOM_LIMITS.completedEstimates);
        const retainedItemIds = new Set(room.history.map(({ itemId }) => itemId).filter(Boolean));
        room.items = room.items.filter(
          (item) => item.status === "pending" || retainedItemIds.has(item.id),
        );
        safeLog("round_finalized", {
          roomId: room.id,
          participantCount: round.eligibleParticipantIds.length,
          historyCount: room.history.length,
        });
        break;
      }

      default:
        throw new Error("Unknown room action.");
    }
  }

  roomView(room, viewer, { includeHistory = true } = {}) {
    const round = room.currentRound;
    const now = Date.now();
    const activeReactions = room.reactions.filter(
      ({ createdAt }) => now - createdAt < REACTION_LIFETIME_MS,
    );
    const votesVisible = round?.phase === "revealed" || round?.phase === "finalized";
    const ownVote = round?.votes[viewer.id] ?? null;

    return {
      id: room.id,
      name: room.name,
      deck: room.deck,
      settings: room.settings,
      isLocked: room.isLocked,
      isClosed: room.isClosed,
      closedAt: room.closedAt ?? null,
      reactions: activeReactions.map((reaction) => {
        const reactor = room.participants.find(({ id }) => id === reaction.participantId);
        return {
          ...reaction,
          participantName: reactor ? displayName(reactor) : "Someone",
          color: reactor?.color ?? "#607069",
        };
      }),
      raisedHands: room.raisedHands
        .map((participantId) => room.participants.find(({ id }) => id === participantId))
        .filter(Boolean)
        .map((person) => ({
          participantId: person.id,
          participantName: displayName(person),
          color: person.color,
        })),
      items: room.items,
      expiresAt: room.expiresAt,
      viewer: {
        id: viewer.id,
        displayName: displayName(viewer),
        color: viewer.color,
        role: viewer.role,
        isCreator: viewer.id === room.creatorParticipantId,
      },
      participants: room.participants.map((participant) => ({
        id: participant.id,
        displayName: displayName(participant),
        color: participant.color,
        role: participant.role,
        connected: participant.connected,
        hasVoted: Boolean(round?.votes[participant.id]?.confirmed),
        vote: votesVisible ? round?.votes[participant.id]?.value ?? null : undefined,
        // Between rounds there is no fixed list yet: report who would vote now.
        eligible: round
          ? round.eligibleParticipantIds.includes(participant.id)
          : isEligibleVoter(participant, room.settings),
      })),
      currentRound: round
        ? {
            id: round.id,
            itemId: round.itemId ?? null,
            title: round.title,
            phase: round.phase,
            startedAt: round.startedAt,
            revealAvailableAt: round.revealAvailableAt,
            revealAllowed: round.revealAllowed,
            suggestion: votesVisible ? round.suggestion : null,
            metrics: votesVisible ? round.metrics : null,
            finalValue: round.finalValue,
            ownVote: votesVisible || ownVote
              ? { value: ownVote?.value ?? null, confirmed: ownVote?.confirmed ?? false }
              : null,
          }
        : null,
      // History is large and only changes on finalize, so it is sent with the
      // initial state and finalize broadcasts, then omitted from the frequent
      // reaction/vote/presence syncs. The client preserves its last copy when a
      // state message arrives without it.
      ...(includeHistory ? { history: room.history } : {}),
    };
  }

  // `details` optionally carries { kind, params } so clients can rebuild the
  // announcement in their own language; `message` stays as the English fallback.
  async announce(room, message, details = {}) {
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(JSON.stringify({ type: "announcement", message, ...details }));
      } catch {
        // Disconnected sockets are cleaned up by the close handler.
      }
    }
  }

  async broadcast(room, { includeHistory = false, excludeSocket = null } = {}) {
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === excludeSocket) continue;
      const attachment = socket.deserializeAttachment();
      const viewer = findParticipantByToken(room, attachment?.token);
      if (!viewer) {
        // A rotated token (recovery redemption) leaves the participant in
        // place; only a removal takes the row away.
        const superseded = room.participants.some(({ id }) => id === attachment?.participantId);
        socket.close(superseded ? 4003 : 4001, superseded ? "Session superseded" : "Removed from room");
        continue;
      }
      try {
        socket.send(JSON.stringify({ type: "state", room: this.roomView(room, viewer, { includeHistory }) }));
      } catch {
        // The close handler will update presence for disconnected sockets.
      }
    }
  }
}
