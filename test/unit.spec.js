import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { i18n } from "@lingui/core";
import { DECKS } from "../shared/decks.js";
import { ROOM_LIMITS } from "../shared/limits.js";
import { csvCell, exportHistory } from "../src/lib/export.js";
import { buildJql } from "../src/lib/jira.js";
import { SERVER_MESSAGES } from "../src/lib/serverMessages.js";
import { FACILITATOR_ONLY, LIMIT_MESSAGES } from "../shared/messages.js";
import {
  calculateResultMetrics,
  calculateSuggestion,
  cleanCards,
  readJson,
  ValidationError,
} from "../worker/room-logic.js";
import { chooseFacilitatorSuccessor, cleanName, PlanningRoom } from "../worker/index.js";
import { handleJira } from "../worker/jira.js";

const deck = { cards: ["1", "2", "3", "5", "8", "13", "?", "☕"] };

function roundWith(values) {
  return {
    votes: Object.fromEntries(values.map((value, index) => [
      `person-${index}`,
      { value, confirmed: true },
    ])),
  };
}

describe("suggestion algorithms", () => {
  it("uses the higher card for tied most-vote results", () => {
    expect(calculateSuggestion(roundWith(["2", "5"]), deck, "most_votes")).toMatchObject({
      value: "5",
      tied: true,
    });
  });

  it("finds the deck midpoint for middle ground", () => {
    expect(calculateSuggestion(roundWith(["1", "13"]), deck, "middle_ground")).toMatchObject({
      value: "5",
      tied: true,
    });
  });

  it("skips interleaved special cards when resolving the middle ground midpoint", () => {
    const customDeck = { cards: ["1", "2", "☕", "8", "13"] };
    // The raw-index midpoint of "1"..."13" lands on "☕"; the numeric-only
    // midpoint must pick a real estimate instead.
    expect(calculateSuggestion(roundWith(["1", "13"]), customDeck, "middle_ground")).toMatchObject({
      value: "8",
      tied: true,
    });
  });

  it("calculates median, rounded average, highest, and no suggestion", () => {
    const round = roundWith(["1", "3", "13"]);
    expect(calculateSuggestion(round, deck, "median").value).toBe("3");
    expect(calculateSuggestion(round, deck, "average_up").value).toBe("8");
    expect(calculateSuggestion(round, deck, "highest").value).toBe("13");
    expect(calculateSuggestion(round, deck, "none")).toBeNull();
  });
});

describe("result metrics", () => {
  it("calculates consensus and deck spread", () => {
    expect(calculateResultMetrics(roundWith(["2", "2", "8"]), deck)).toEqual({
      voteCount: 3,
      consensusPercent: 67,
      unanimous: false,
      low: "2",
      high: "8",
      spread: 3,
    });
  });
});

describe("input safety", () => {
  it("enforces the shared card limit", () => {
    expect(() => cleanCards(Array.from({ length: ROOM_LIMITS.cards + 1 }, (_, index) => index)))
      .toThrow(/at most 16 cards/);
  });

  it("stops reading request bodies after the byte limit", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(ROOM_LIMITS.requestBytes) }),
    });
    await expect(readJson(request)).rejects.toThrow("Request is too large.");
  });

  it("flags malformed input as a ValidationError so the worker returns 400, not 500", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    await expect(readJson(request)).rejects.toBeInstanceOf(ValidationError);
  });

  it("strips zero-width and bidi-control characters from names", () => {
    const ZWSP = String.fromCharCode(0x200b), ZWNJ = String.fromCharCode(0x200c), ZWJ = String.fromCharCode(0x200d);
    const RLO = String.fromCharCode(0x202e); // right-to-left override
    // A name of only zero-width chars would render visually blank.
    expect(cleanName(ZWSP + ZWNJ + ZWJ)).toBe("Guest");
    // A bidi override could reorder the UI text rendered around the name.
    expect(cleanName("Ann" + RLO + "evE")).toBe("AnnevE");
    // Ordinary whitespace still collapses to a single space, not deleted.
    expect(cleanName("Ada  \t Lovelace")).toBe("Ada Lovelace");
  });

  it("neutralizes spreadsheet formulas in CSV cells", () => {
    expect(csvCell('=HYPERLINK("https://example.test")'))
      .toBe('"\'=HYPERLINK(""https://example.test"")"');
  });
});

describe("authorization", () => {
  it("rejects facilitator actions from regular participants", async () => {
    const object = new PlanningRoom({});
    const participant = { id: "p1", role: "participant" };
    const room = {
      deck,
      settings: { revealDelaySeconds: 30 },
      currentRound: null,
    };

    await expect(object.applyAction(room, participant, { type: "start_round", title: "Nope" }))
      .rejects.toThrow("Only the facilitator can start a round.");
    await expect(object.applyAction(room, participant, { type: "set_room_lock", locked: true }))
      .rejects.toThrow("Only the facilitator can lock the room.");
  });
});

function person(name, role) {
  return { id: `${name}-id`, token: `${name}-token`, name, suffix: "0000", role };
}

function makeRoom(participants) {
  return {
    deck: { cards: ["1", "2", "3", "5", "8", "13", "?", "☕"] },
    settings: { revealDelaySeconds: 0, suggestionAlgorithm: "most_votes" },
    participants,
    items: [],
    reactions: [],
    raisedHands: [],
    history: [],
    isClosed: false,
    isLocked: false,
    currentRound: null,
  };
}

async function castVote(object, room, voter, value) {
  await object.applyAction(room, voter, { type: "select_vote", value });
  await object.applyAction(room, voter, { type: "confirm_vote" });
}

describe("round lifecycle", () => {
  it("runs a round from start through finalized history", async () => {
    const object = new PlanningRoom({});
    const facilitator = person("Ana", "facilitator");
    const voter = person("Bo", "participant");
    const room = makeRoom([facilitator, voter]);

    await object.applyAction(room, facilitator, { type: "start_round", title: "Login page" });
    expect(room.currentRound.phase).toBe("voting");
    expect(room.currentRound.eligibleParticipantIds).toEqual([facilitator.id, voter.id]);

    await castVote(object, room, facilitator, "5");
    expect(room.currentRound.revealAllowed).toBe(false); // voter has not confirmed yet
    await castVote(object, room, voter, "5");
    expect(room.currentRound.revealAllowed).toBe(true); // everyone confirmed

    await object.applyAction(room, facilitator, { type: "reveal" });
    expect(room.currentRound.phase).toBe("revealed");
    expect(room.currentRound.metrics.unanimous).toBe(true);

    await object.applyAction(room, facilitator, { type: "finalize", value: "5" });
    expect(room.currentRound.phase).toBe("finalized");
    expect(room.history).toHaveLength(1);
    expect(room.history[0]).toMatchObject({ finalValue: "5" });
    expect(room.history[0].votes).toHaveLength(2);
  });

  it("recomputes suggestion and metrics when a voter is removed after reveal", async () => {
    const object = new PlanningRoom({});
    const facilitator = person("Ana", "facilitator");
    const agree = person("Bo", "participant");
    const outlier = person("Cy", "participant");
    const room = makeRoom([facilitator, agree, outlier]);

    await object.applyAction(room, facilitator, { type: "start_round", title: "Search" });
    await castVote(object, room, facilitator, "2");
    await castVote(object, room, agree, "2");
    await castVote(object, room, outlier, "8");
    await object.applyAction(room, facilitator, { type: "reveal" });
    expect(room.currentRound.metrics).toMatchObject({ voteCount: 3, high: "8", unanimous: false });

    await object.applyAction(room, facilitator, {
      type: "remove_participant",
      participantId: outlier.id,
    });
    // Without recomputation the agreement %, spread, and suggestion would still
    // reflect the removed "8" vote — and that stale snapshot is what finalize writes.
    expect(room.currentRound.metrics).toMatchObject({
      voteCount: 2,
      high: "2",
      unanimous: true,
      consensusPercent: 100,
    });
    expect(room.currentRound.suggestion).toMatchObject({ value: "2" });
  });

  it("auto-allows reveal when the last unconfirmed voter is removed", async () => {
    const object = new PlanningRoom({});
    const facilitator = person("Ana", "facilitator");
    const ready = person("Bo", "participant");
    const missing = person("Cy", "participant");
    const room = makeRoom([facilitator, ready, missing]);

    await object.applyAction(room, facilitator, { type: "start_round", title: "API" });
    await castVote(object, room, facilitator, "3");
    await castVote(object, room, ready, "3");
    expect(room.currentRound.revealAllowed).toBe(false); // "missing" has not voted

    await object.applyAction(room, facilitator, {
      type: "remove_participant",
      participantId: missing.id,
    });
    expect(room.currentRound.revealAllowed).toBe(true);
  });

  it("auto-reveals when the last voter confirms and the setting is on", async () => {
    const object = new PlanningRoom({});
    const facilitator = person("Ana", "facilitator");
    const voter = person("Bo", "participant");
    const room = makeRoom([facilitator, voter]);
    room.settings.autoRevealEnabled = true;

    await object.applyAction(room, facilitator, { type: "start_round", title: "Login page" });
    await castVote(object, room, facilitator, "5");
    expect(room.currentRound.phase).toBe("voting"); // one voter still out

    await castVote(object, room, voter, "5");
    // The last confirm turns the cards over without a manual reveal.
    expect(room.currentRound.phase).toBe("revealed");
    expect(room.currentRound.metrics.unanimous).toBe(true);
    expect(room.currentRound.suggestion).toMatchObject({ value: "5" });
  });

  it("leaves the round in voting when auto-reveal is off", async () => {
    const object = new PlanningRoom({});
    const facilitator = person("Ana", "facilitator");
    const voter = person("Bo", "participant");
    const room = makeRoom([facilitator, voter]);

    await object.applyAction(room, facilitator, { type: "start_round", title: "Login page" });
    await castVote(object, room, facilitator, "5");
    await castVote(object, room, voter, "5");
    expect(room.currentRound.phase).toBe("voting");
    expect(room.currentRound.revealAllowed).toBe(true);
  });

  it("auto-reveals when removing the last unconfirmed voter with the setting on", async () => {
    const object = new PlanningRoom({});
    const facilitator = person("Ana", "facilitator");
    const ready = person("Bo", "participant");
    const missing = person("Cy", "participant");
    const room = makeRoom([facilitator, ready, missing]);
    room.settings.autoRevealEnabled = true;

    await object.applyAction(room, facilitator, { type: "start_round", title: "API" });
    await castVote(object, room, facilitator, "3");
    await castVote(object, room, ready, "3");
    expect(room.currentRound.phase).toBe("voting");

    await object.applyAction(room, facilitator, {
      type: "remove_participant",
      participantId: missing.id,
    });
    expect(room.currentRound.phase).toBe("revealed");
    expect(room.currentRound.metrics).toMatchObject({ voteCount: 2, unanimous: true });
  });
});

describe("history payload", () => {
  it("includes history by default but omits it when asked, to save bandwidth", () => {
    const object = new PlanningRoom({});
    const viewer = person("Ana", "facilitator");
    const room = makeRoom([viewer]);
    room.history = [{ id: "h1", title: "Done", votes: [] }];

    expect(object.roomView(room, viewer).history).toHaveLength(1);
    expect(object.roomView(room, viewer, { includeHistory: false })).not.toHaveProperty("history");
  });
});

describe("facilitator succession", () => {
  const fac = { id: "f", role: "facilitator", connected: false, joinedAt: 0 };

  it("prefers the longest-tenured connected voting participant", () => {
    const observer = { id: "o", role: "observer", connected: true, joinedAt: 10 };
    const early = { id: "e", role: "participant", connected: true, joinedAt: 20 };
    const late = { id: "l", role: "participant", connected: true, joinedAt: 30 };
    // The observer joined earliest, but a voting participant is preferred.
    expect(chooseFacilitatorSuccessor([fac, observer, early, late], "f").id).toBe("e");
  });

  it("falls back to an observer when no voting participant is connected", () => {
    const observer = { id: "o", role: "observer", connected: true, joinedAt: 10 };
    const goneVoter = { id: "p", role: "participant", connected: false, joinedAt: 5 };
    expect(chooseFacilitatorSuccessor([fac, observer, goneVoter], "f").id).toBe("o");
  });

  it("returns null when nobody else is connected to hand off to", () => {
    const online = { ...fac, connected: true };
    const gone = { id: "p", role: "participant", connected: false, joinedAt: 5 };
    expect(chooseFacilitatorSuccessor([online, gone], "f")).toBeNull();
  });
});

function fakeCtx() {
  let stored;
  return {
    storage: {
      get: async () => stored,
      put: async (_key, value) => { stored = value; },
      setAlarm: async () => {},
      deleteAll: async () => { stored = undefined; },
    },
    getWebSockets: () => [],
  };
}

function recoverRequest(code) {
  return new Request("https://room.internal/recover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
}

describe("facilitator recovery", () => {
  it("reinstates the creator with the recovery code and rejects a wrong one", async () => {
    const object = new PlanningRoom(fakeCtx());
    const createRes = await object.create(new Request("https://room.internal/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId: "merry-jade-otter-a1b2c3",
        roomName: "Merry Jade Otter",
        facilitatorName: "Ada",
        deckId: "fibonacci",
      }),
    }));
    const created = await createRes.json();
    expect(created.recoveryCode).toBeTruthy();
    const creatorId = created.participantId;

    // Simulate an auto-transfer having moved facilitation to a teammate.
    const room = await object.loadRoom();
    room.participants.find((participant) => participant.id === creatorId).role = "participant";
    room.participants.push({
      id: "mate", token: "mate-token", name: "Bo", suffix: "0000",
      role: "facilitator", connected: true, joinedAt: Date.now(), disconnectedAt: null,
    });

    const badRes = await object.recover(recoverRequest("not-the-code"), await object.loadRoom());
    expect(badRes.status).toBe(403);

    const goodRes = await object.recover(recoverRequest(created.recoveryCode), await object.loadRoom());
    expect(goodRes.status).toBe(200);
    const recovered = await goodRes.json();
    expect(recovered.participantId).toBe(creatorId);
    expect(recovered.token).not.toBe(created.token); // token rotated onto the recovering browser

    const after = await object.loadRoom();
    expect(after.participants.find((participant) => participant.id === creatorId).role).toBe("facilitator");
    expect(after.participants.find((participant) => participant.id === "mate").role).toBe("participant");
  });
});

describe("facilitator voting setting", () => {
  it("keeps the facilitator eligible by default", async () => {
    const object = new PlanningRoom({});
    const facilitator = person("Ana", "facilitator");
    const voter = person("Bo", "participant");
    const room = makeRoom([facilitator, voter]);

    await object.applyAction(room, facilitator, { type: "start_round", title: "Login page" });
    expect(room.currentRound.eligibleParticipantIds).toEqual([facilitator.id, voter.id]);
  });

  it("leaves the facilitator out of the round when they do not vote", async () => {
    const object = new PlanningRoom({});
    const facilitator = person("Ana", "facilitator");
    const voter = person("Bo", "participant");
    const observer = person("Cy", "observer");
    const room = makeRoom([facilitator, voter, observer]);
    room.settings.facilitatorVotes = false;

    await object.applyAction(room, facilitator, { type: "start_round", title: "Login page" });
    expect(room.currentRound.eligibleParticipantIds).toEqual([voter.id]);

    await castVote(object, room, voter, "5");
    expect(room.currentRound.revealAllowed).toBe(true);

    await expect(object.applyAction(room, facilitator, { type: "select_vote", value: "5" }))
      .rejects.toThrow();

    await object.applyAction(room, facilitator, { type: "reveal" });
    await object.applyAction(room, facilitator, { type: "finalize", value: "5" });
    expect(room.history[0].votes).toHaveLength(1);
  });

  it("refuses to start a round that nobody could vote in", async () => {
    const object = new PlanningRoom({});
    const facilitator = person("Ana", "facilitator");
    const observer = person("Bo", "observer");
    const room = makeRoom([facilitator, observer]);
    room.settings.facilitatorVotes = false;

    await expect(object.applyAction(room, facilitator, { type: "start_round", title: "Login page" }))
      .rejects.toThrow("A round needs at least one voter.");
    expect(room.currentRound).toBe(null);
  });

  it("still refuses when the facilitator is the only person and sits out", async () => {
    const object = new PlanningRoom({});
    const facilitator = person("Ana", "facilitator");
    const room = makeRoom([facilitator]);
    room.settings.facilitatorVotes = false;

    await expect(object.applyAction(room, facilitator, { type: "start_round", title: "Login page" }))
      .rejects.toThrow("A round needs at least one voter.");
  });
});

describe("reclaiming facilitation", () => {
  function creatorRoom(participants, creator) {
    const room = makeRoom(participants);
    room.creatorParticipantId = creator.id;
    return room;
  }

  it("lets the creator take the role back from an auto-transfer successor", async () => {
    const object = new PlanningRoom({});
    const creator = person("Ana", "participant"); // demoted by the away timer
    const successor = person("Bo", "facilitator");
    const room = creatorRoom([creator, successor], creator);
    const creatorToken = creator.token;

    const outcome = await object.applyAction(room, creator, { type: "reclaim_facilitator" });
    expect(creator.role).toBe("facilitator");
    expect(successor.role).toBe("participant");
    expect(outcome.announcement.details.kind).toBe("facilitator_reclaimed");
    // Rotating here would sign out the browser making the request.
    expect(creator.token).toBe(creatorToken);
  });

  it("refuses anyone who did not create the room", async () => {
    const object = new PlanningRoom({});
    const creator = person("Ana", "participant");
    const other = person("Bo", "participant");
    const facilitator = person("Cy", "facilitator");
    const room = creatorRoom([creator, other, facilitator], creator);

    await expect(object.applyAction(room, other, { type: "reclaim_facilitator" }))
      .rejects.toThrow("Only the person who created this room can take facilitation back.");
    expect(facilitator.role).toBe("facilitator");
  });

  it("refuses when the creator already holds the role", async () => {
    const object = new PlanningRoom({});
    const creator = person("Ana", "facilitator");
    const room = creatorRoom([creator], creator);

    await expect(object.applyAction(room, creator, { type: "reclaim_facilitator" }))
      .rejects.toThrow("You are already the facilitator.");
  });
});

describe("decks", () => {
  // A deck whose name or description never reaches the catalog stays English
  // for Spanish users, which is invisible until someone opens the picker.
  const catalog = new Map(
    readFileSync(new URL("../src/locales/es.po", import.meta.url), "utf8")
      .split("\n\n")
      .map((entry) => [
        entry.match(/^msgid "(.*)"$/m)?.[1],
        entry.match(/^msgstr "(.*)"$/m)?.[1],
      ])
      .filter(([id]) => id),
  );

  it.each(Object.entries(DECKS))("%s is a legal deck", (id, deck) => {
    expect(deck.id).toBe(id);
    expect(cleanCards(deck.cards)).toEqual(deck.cards);
  });

  it.each(Object.values(DECKS))("$id has Spanish name and description", (deck) => {
    expect(catalog.get(deck.name)).toBeTruthy();
    expect(catalog.get(deck.description)).toBeTruthy();
  });
});

describe("history export", () => {
  // The export strings go through Lingui macros, which need an active locale.
  beforeAll(() => {
    i18n.load("en", {});
    i18n.activate("en");
  });

  const room = {
    name: "Team Room",
    items: [{ id: "item-1", key: "WEB-7", url: "https://acme.atlassian.net/browse/WEB-7" }],
    history: [{
      itemId: "item-1",
      title: "Login flow",
      finalValue: "5",
      suggestion: { value: "5" },
      metrics: { consensusPercent: 80 },
      votes: [{ participantName: "Ada", value: "5", confirmed: true }],
      completedAt: 0,
    }],
  };

  function stubBrowser() {
    const revoked = [];
    const link = {};
    link.click = () => {};
    vi.stubGlobal("document", { createElement: () => link });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => revoked.push(url));
    return { link, revoked };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // Revoking in the same tick as click() aborts the download in Safari and Firefox.
  it.each(["csv", "md"])("keeps the %s blob alive past the click", (format) => {
    vi.useFakeTimers();
    const { link, revoked } = stubBrowser();

    exportHistory(room, format);

    expect(link.href).toBe("blob:test");
    expect(link.download).toBe(`team-room-estimates.${format}`);
    expect(revoked).toEqual([]);

    vi.runAllTimers();
    expect(revoked).toEqual(["blob:test"]);
  });

  it("adds the issue key and link when the room has Jira items", async () => {
    stubBrowser();
    exportHistory(room, "csv");
    const csv = await URL.createObjectURL.mock.calls[0][0].text();
    const [header, row] = csv.split("\n");
    expect(header).toContain('"Issue","Item"');
    expect(row.startsWith('"WEB-7","Login flow"')).toBe(true);
    expect(row.endsWith('"https://acme.atlassian.net/browse/WEB-7"')).toBe(true);

    exportHistory({ ...room, items: [] }, "csv");
    expect(await URL.createObjectURL.mock.calls[1][0].text()).not.toContain("Issue");
  });
});

describe("Jira items", () => {
  const siteUrl = "https://acme.atlassian.net";

  it("stores the issue key and a link built on the server", async () => {
    const object = new PlanningRoom({});
    const facilitator = person("Ana", "facilitator");
    const room = makeRoom([facilitator]);
    await object.applyAction(room, facilitator, {
      type: "add_items",
      siteUrl,
      items: [
        { key: "WEB-1", title: "Fix login", url: "https://evil.example/browse/WEB-1" },
        { key: "WEB-2", title: "Fix login" },
        { key: "not a key", title: "Dropped" },
      ],
    });
    expect(room.items.map(({ key, title, url }) => ({ key, title, url }))).toEqual([
      { key: "WEB-1", title: "Fix login", url: "https://acme.atlassian.net/browse/WEB-1" },
      { key: "WEB-2", title: "Fix login", url: "https://acme.atlassian.net/browse/WEB-2" },
    ]);

    await object.applyAction(room, facilitator, {
      type: "add_items",
      siteUrl,
      items: [{ key: "WEB-1", title: "Renamed since" }, { key: "WEB-3", title: "New" }],
    });
    expect(room.items.map(({ key }) => key)).toEqual(["WEB-1", "WEB-2", "WEB-3"]);
  });

  it.each(["https://evil.example", "http://acme.atlassian.net", "https://atlassian.net.evil.example", ""])(
    "refuses links to '%s'",
    async (badSite) => {
      const object = new PlanningRoom({});
      const facilitator = person("Ana", "facilitator");
      const room = makeRoom([facilitator]);
      await expect(object.applyAction(room, facilitator, {
        type: "add_items",
        siteUrl: badSite,
        items: [{ key: "WEB-1", title: "Fix login" }],
      })).rejects.toThrow("That Jira site is not supported.");
      expect(room.items).toEqual([]);
    },
  );

  it("builds a bounded JQL search from the pickers", () => {
    expect(buildJql("WEB", "backlog"))
      .toBe('project = "WEB" AND statusCategory != Done AND sprint is EMPTY ORDER BY Rank ASC');
    expect(buildJql('WE"B', "all_open"))
      .toBe('project = "WEB" AND statusCategory != Done ORDER BY created DESC');
  });
});

describe("Jira connection", () => {
  const env = { JIRA_CLIENT_ID: "client-id", JIRA_CLIENT_SECRET: "client-secret" };
  const cloudId = "11111111-2222-3333-4444-555555555555";

  function call(path, { cookie, ...init } = {}, environment = env) {
    const url = new URL(`https://pointtaken.team/api/jira${path}`);
    const request = new Request(url, {
      ...init,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...init.headers },
    });
    return handleJira(request, environment, url);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stays hidden until the OAuth app is configured", async () => {
    expect(await (await call("/status", {}, {})).json()).toMatchObject({ available: false, connected: false });
    expect((await call("/connect", {}, {})).status).toBe(404);
  });

  it("sends the facilitator to Atlassian with a state bound to this browser", async () => {
    const response = await call("/connect?lang=es");
    const target = new URL(response.headers.get("Location"));
    const stateCookie = response.headers.get("Set-Cookie");

    expect(response.status).toBe(302);
    expect(target.origin).toBe("https://auth.atlassian.com");
    expect(target.searchParams.get("scope")).toBe("read:jira-work");
    expect(target.searchParams.get("redirect_uri")).toBe("https://pointtaken.team/api/jira/callback");
    expect(stateCookie).toContain(`point_taken_jira_state=${target.searchParams.get("state")}.es`);
    expect(stateCookie).toContain("HttpOnly");
    expect(stateCookie).toContain("SameSite=Lax");
  });

  it("refuses a callback whose state does not match, without spending the code", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await call("/callback?code=abc&state=forged", { cookie: "point_taken_jira_state=real.en" });

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.headers.get("Set-Cookie")).not.toContain("point_taken_jira_0");
  });

  it("keeps the token in HttpOnly cookies and out of the page", async () => {
    const token = "t".repeat(3500);
    const fetchMock = vi.fn(async () => Response.json({ access_token: token, expires_in: 3600 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await call("/callback?code=abc&state=real", { cookie: "point_taken_jira_state=real.en" });
    const cookies = response.headers.getSetCookie();

    expect(response.status).toBe(200);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      grant_type: "authorization_code",
      client_secret: "client-secret",
      code: "abc",
    });
    expect(cookies.find((value) => value.startsWith("point_taken_jira_0=")))
      .toContain("Max-Age=3600; HttpOnly; SameSite=Strict; Secure");
    expect(cookies.find((value) => value.startsWith("point_taken_jira_1="))).toContain("t".repeat(500));
    expect(cookies.find((value) => value.startsWith("point_taken_jira_2="))).toContain("Max-Age=0");
    expect(await response.text()).not.toContain(token.slice(0, 50));
    expect(response.headers.get("Content-Security-Policy")).toMatch(/script-src 'nonce-[0-9a-f]+'/);
  });

  it("searches Jira with the cookie token and returns only key, title and type", async () => {
    const fetchMock = vi.fn(async () => Response.json({
      issues: [{ key: "WEB-1", fields: { summary: "Fix login", issuetype: { name: "Story" }, description: "private" } }],
      nextPageToken: "next",
    }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await call("/search", {
      method: "POST",
      cookie: "point_taken_jira_0=abc; point_taken_jira_1=def",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cloudId, jql: "project = WEB" }),
    });

    const [target, init] = fetchMock.mock.calls[0];
    expect(target).toBe(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql`);
    expect(init.headers.Authorization).toBe("Bearer abcdef");
    expect(JSON.parse(init.body).fields).toEqual(["summary", "issuetype"]);
    expect(await response.json()).toEqual({
      issues: [{ key: "WEB-1", title: "Fix login", type: "Story" }],
      nextPageToken: "next",
    });
  });

  it("will not build an Atlassian URL from a malformed site id", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await call("/search", {
      method: "POST",
      cookie: "point_taken_jira_0=abc",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cloudId: "../../oauth/token", jql: "project = WEB" }),
    });
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("drops the cookies once Atlassian rejects the token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401 })));
    const response = await call("/status", { cookie: "point_taken_jira_0=expired" });

    expect(await response.json()).toMatchObject({ available: true, connected: false });
    expect(response.headers.getSetCookie()[0]).toContain("point_taken_jira_0=; Path=/api/jira; Max-Age=0");
  });
});

describe("server message catalog", () => {
  const catalog = new Set(SERVER_MESSAGES.map((descriptor) => descriptor.message));

  it.each(Object.entries({ ...FACILITATOR_ONLY, ...LIMIT_MESSAGES }))(
    "has a translatable entry for %s",
    (_key, message) => {
      expect(catalog).toContain(message);
    },
  );
});

describe("editing the queue during a round", () => {
  async function roomWithQueue() {
    const object = new PlanningRoom({});
    const facilitator = person("Ana", "facilitator");
    const room = makeRoom([facilitator, person("Bo", "participant")]);
    await object.applyAction(room, facilitator, { type: "add_items", titles: ["First", "Second"] });
    const [first, second] = room.items;
    await object.applyAction(room, facilitator, { type: "start_round", itemId: first.id });
    return { object, facilitator, room, first, second };
  }

  it("lets the facilitator add and reorder items while a vote is running", async () => {
    const { object, facilitator, room, first, second } = await roomWithQueue();

    await object.applyAction(room, facilitator, { type: "add_items", titles: ["Third"] });
    expect(room.items.map((item) => item.title)).toEqual(["First", "Second", "Third"]);

    const third = room.items[2];
    await object.applyAction(room, facilitator, {
      type: "reorder_items",
      itemIds: [third.id, first.id, second.id],
    });
    expect(room.items.map((item) => item.title)).toEqual(["Third", "First", "Second"]);
    expect(room.currentRound.phase).toBe("voting");
  });

  it("lets other pending items be edited or removed, but protects the item under vote", async () => {
    const { object, facilitator, room, first, second } = await roomWithQueue();

    await object.applyAction(room, facilitator, { type: "update_item", itemId: second.id, title: "Second, refined" });
    expect(room.items[1].title).toBe("Second, refined");
    await object.applyAction(room, facilitator, { type: "remove_item", itemId: second.id });
    expect(room.items.map((item) => item.title)).toEqual(["First"]);

    await expect(object.applyAction(room, facilitator, { type: "update_item", itemId: first.id, title: "Renamed" }))
      .rejects.toThrow("That item is being voted on right now.");
    await expect(object.applyAction(room, facilitator, { type: "remove_item", itemId: first.id }))
      .rejects.toThrow("That item is being voted on right now.");
    expect(room.items[0].title).toBe("First");
  });

  it("frees the item once the round is finalized", async () => {
    const { object, facilitator, room, first } = await roomWithQueue();
    const voter = room.participants[1];
    await castVote(object, room, facilitator, "3");
    await castVote(object, room, voter, "3");
    await object.applyAction(room, facilitator, { type: "reveal" });
    await object.applyAction(room, facilitator, { type: "finalize", value: "3" });

    expect(room.items[0]).toMatchObject({ id: first.id, status: "estimated" });
    await expect(object.applyAction(room, facilitator, { type: "update_item", itemId: first.id, title: "Renamed" }))
      .rejects.toThrow("That pending item was not found.");
  });

  it("removes an estimated item together with its saved result", async () => {
    const { object, facilitator, room, first, second } = await roomWithQueue();
    const voter = room.participants[1];
    await castVote(object, room, facilitator, "3");
    await castVote(object, room, voter, "3");
    await object.applyAction(room, facilitator, { type: "reveal" });
    await object.applyAction(room, facilitator, { type: "finalize", value: "3" });
    expect(room.history).toHaveLength(1);

    await object.applyAction(room, facilitator, { type: "remove_item", itemId: first.id });
    expect(room.items.map((item) => item.id)).toEqual([second.id]);
    expect(room.history).toHaveLength(0);

    await expect(object.applyAction(room, facilitator, { type: "remove_item", itemId: first.id }))
      .rejects.toThrow("That item was not found.");
  });
});

describe("voting without confirmation", () => {
  it("locks a card the moment it is picked when the setting is off", async () => {
    const object = new PlanningRoom({});
    const facilitator = person("Ana", "facilitator");
    const voter = person("Bo", "participant");
    const room = makeRoom([facilitator, voter]);
    room.settings.confirmVotes = false;
    room.settings.autoRevealEnabled = true;

    await object.applyAction(room, facilitator, { type: "start_round", title: "Login page" });
    await object.applyAction(room, facilitator, { type: "select_vote", value: "5" });
    expect(room.currentRound.votes[facilitator.id].confirmed).toBe(true);
    expect(room.currentRound.phase).toBe("voting");

    await object.applyAction(room, facilitator, { type: "select_vote", value: "8" });
    expect(room.currentRound.votes[facilitator.id]).toMatchObject({ value: "8", confirmed: true });

    await object.applyAction(room, voter, { type: "select_vote", value: "8" });
    expect(room.currentRound.revealAllowed).toBe(true);
    expect(room.currentRound.phase).toBe("revealed");
  });

  it("still waits for a confirmation by default", async () => {
    const object = new PlanningRoom({});
    const facilitator = person("Ana", "facilitator");
    const room = makeRoom([facilitator]);
    room.settings.confirmVotes = true;

    await object.applyAction(room, facilitator, { type: "start_round", title: "Login page" });
    await object.applyAction(room, facilitator, { type: "select_vote", value: "5" });
    expect(room.currentRound.votes[facilitator.id].confirmed).toBe(false);
    expect(room.currentRound.revealAllowed).toBe(false);
  });
});
