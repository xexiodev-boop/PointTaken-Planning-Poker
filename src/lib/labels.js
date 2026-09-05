import { i18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";

// shared/ is imported by the worker, so it must stay free of i18n concerns.
// The client translates deck and reaction metadata here instead, keyed by the
// stable ids/emoji; anything unknown falls back to the shared English text.

const DECK_NAMES = {
  fibonacci: msg`Fibonacci`,
  modified: msg`Modified Fibonacci`,
  powers: msg`Powers of two`,
  tshirt: msg`T-shirt sizes`,
};

const DECK_DESCRIPTIONS = {
  fibonacci: msg`A focused sequence for relative complexity.`,
  modified: msg`More range for larger or less certain work.`,
  powers: msg`Each card doubles, for work that scales steeply.`,
  tshirt: msg`Quick, conversational sizing without numbers.`,
};

const REACTION_LABELS = {
  "👍": msg`Agree`,
  "🤔": msg`Unsure`,
  "👀": msg`Reviewing`,
  "🎉": msg`Nice`,
  "☕": msg`Break`,
  "✋": msg`Need to speak`,
};

const ALGORITHM_NAMES = {
  most_votes: msg`Most votes`,
  middle_ground: msg`Middle ground`,
  median: msg`Median`,
  average_up: msg`Average, rounded up`,
  highest: msg`Highest vote`,
  none: msg`No suggestion`,
};

const ALGORITHM_DESCRIPTIONS = {
  most_votes: msg`Pick the most popular card; ties lean higher.`,
  middle_ground: msg`For tied leaders, choose the card nearest their midpoint.`,
  median: msg`Pick the middle submitted card, reducing the effect of extremes.`,
  average_up: msg`Average numeric votes and round up to a card in the deck.`,
  highest: msg`Use the most cautious submitted estimate.`,
  none: msg`Show the votes and leave the decision entirely to the team.`,
};

const REVEAL_DELAY_LABELS = {
  0: msg`Off`,
  15: msg`15 seconds`,
  30: msg`30 seconds`,
  60: msg`60 seconds`,
  90: msg`90 seconds`,
};

export function deckName(deck) {
  const descriptor = DECK_NAMES[deck.id];
  return descriptor ? i18n._(descriptor) : deck.name;
}

export function deckDescription(deck) {
  const descriptor = DECK_DESCRIPTIONS[deck.id];
  return descriptor ? i18n._(descriptor) : deck.description;
}

export function reactionLabel(emoji, fallback) {
  const descriptor = REACTION_LABELS[emoji];
  return descriptor ? i18n._(descriptor) : fallback;
}

export function algorithmName(option) {
  const descriptor = ALGORITHM_NAMES[option.id];
  return descriptor ? i18n._(descriptor) : option.name;
}

export function algorithmDescription(option) {
  const descriptor = ALGORITHM_DESCRIPTIONS[option.id];
  return descriptor ? i18n._(descriptor) : option.description;
}

export function revealDelayLabel(option) {
  const descriptor = REVEAL_DELAY_LABELS[option.seconds];
  return descriptor ? i18n._(descriptor) : option.label;
}
