import { ROOM_LIMITS } from "../shared/limits.js";
import { LIMIT_MESSAGES } from "../shared/messages.js";

// Thrown for malformed/oversized client input. The worker's top-level catch
// maps this to a 400 with the message surfaced; any other error is treated as
// an unexpected internal fault (logged, generic 500) so server faults aren't
// mislabeled as client errors and internal error text isn't leaked.
export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

export function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

export async function readJson(request) {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    throw new ValidationError("Content-Type must be application/json.");
  }
  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (contentLength > ROOM_LIMITS.requestBytes) throw new ValidationError("Request is too large.");

  const reader = request.body?.getReader();
  if (!reader) return {};
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > ROOM_LIMITS.requestBytes) {
      await reader.cancel("Request is too large.");
      throw new ValidationError("Request is too large.");
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }
}

export function cleanCards(cards) {
  if (!Array.isArray(cards)) throw new Error("Cards must be provided as a list.");
  const cleaned = cards
    .map((card) => String(card ?? "").trim().slice(0, 12))
    .filter(Boolean);
  if (cleaned.length < 2) throw new Error("A deck needs at least two cards.");
  if (cleaned.length > ROOM_LIMITS.cards) {
    throw new Error(LIMIT_MESSAGES.cards);
  }
  if (new Set(cleaned).size !== cleaned.length) throw new Error("Deck cards must be unique.");
  return cleaned;
}

function cardIndex(deck, value) {
  return deck.cards.indexOf(value);
}

function parseNumericCard(value) {
  if (value === "½") return 0.5;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function calculateSuggestion(round, deck, algorithm) {
  if (algorithm === "none") return null;

  const values = Object.values(round.votes)
    .filter((vote) => vote?.confirmed && vote.value !== "?" && vote.value !== "☕")
    .map((vote) => vote.value)
    .filter((value) => cardIndex(deck, value) >= 0);

  if (values.length === 0) return null;

  const tally = new Map();
  values.forEach((value) => tally.set(value, (tally.get(value) ?? 0) + 1));

  if (algorithm === "highest") {
    const value = [...values].sort((a, b) => cardIndex(deck, a) - cardIndex(deck, b)).at(-1);
    return { value, algorithm, tied: false };
  }

  if (algorithm === "median") {
    const ordered = [...values].sort((a, b) => cardIndex(deck, a) - cardIndex(deck, b));
    return { value: ordered[Math.floor(ordered.length / 2)], algorithm, tied: false };
  }

  if (algorithm === "average_up") {
    const numericCards = deck.cards
      .map((value) => ({ value, number: parseNumericCard(value) }))
      .filter((card) => card.number !== null)
      .sort((a, b) => a.number - b.number);
    const numericVotes = values.map(parseNumericCard).filter((value) => value !== null);
    if (numericCards.length === 0 || numericVotes.length === 0) return null;
    const average = numericVotes.reduce((total, value) => total + value, 0) / numericVotes.length;
    const selected = numericCards.find((card) => card.number >= average) ?? numericCards.at(-1);
    return { value: selected.value, algorithm, average, tied: false };
  }

  const highestCount = Math.max(...tally.values());
  const tied = [...tally.entries()]
    .filter(([, count]) => count === highestCount)
    .map(([value]) => value);
  const ordered = tied.sort((a, b) => cardIndex(deck, a) - cardIndex(deck, b));

  if (algorithm === "middle_ground" && ordered.length > 1) {
    const firstIndex = cardIndex(deck, ordered[0]);
    const lastIndex = cardIndex(deck, ordered.at(-1));
    // Resolve the midpoint among numeric cards only. Indexing the raw deck can
    // land on an interleaved special card (?, ☕) on facilitator-edited decks
    // and suggest a non-estimate.
    const numericBetween = deck.cards.filter(
      (value, index) => index >= firstIndex && index <= lastIndex && parseNumericCard(value) !== null,
    );
    if (numericBetween.length > 0) {
      return {
        value: numericBetween[Math.round((numericBetween.length - 1) / 2)],
        votes: highestCount,
        algorithm,
        tied: true,
      };
    }
  }

  return {
    value: ordered.at(-1),
    votes: highestCount,
    algorithm,
    tied: ordered.length > 1,
  };
}

export function calculateResultMetrics(round, deck) {
  const confirmedValues = Object.values(round.votes)
    .filter((vote) => vote?.confirmed)
    .map((vote) => vote.value);
  if (confirmedValues.length === 0) {
    return { voteCount: 0, consensusPercent: 0, unanimous: false, low: null, high: null, spread: 0 };
  }

  const counts = new Map();
  confirmedValues.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  const highestCount = Math.max(...counts.values());
  const orderedValues = confirmedValues
    .filter((value) => value !== "?" && value !== "☕" && deck.cards.includes(value))
    .sort((a, b) => deck.cards.indexOf(a) - deck.cards.indexOf(b));
  const low = orderedValues[0] ?? null;
  const high = orderedValues.at(-1) ?? null;

  return {
    voteCount: confirmedValues.length,
    consensusPercent: Math.round((highestCount / confirmedValues.length) * 100),
    unanimous: counts.size === 1,
    low,
    high,
    spread: low && high ? deck.cards.indexOf(high) - deck.cards.indexOf(low) : 0,
  };
}
