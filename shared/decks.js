export const DECKS = {
  fibonacci: {
    id: "fibonacci",
    name: "Fibonacci",
    description: "A focused sequence for relative complexity.",
    cards: ["0", "1", "2", "3", "5", "8", "13", "21", "?", "☕"],
  },
  modified: {
    id: "modified",
    name: "Modified Fibonacci",
    description: "More range for larger or less certain work.",
    cards: ["0", "½", "1", "2", "3", "5", "8", "13", "20", "40", "100", "?", "☕"],
  },
  powers: {
    id: "powers",
    name: "Powers of two",
    description: "Each card doubles, for work that scales steeply.",
    cards: ["0", "1", "2", "4", "8", "16", "32", "64", "?", "☕"],
  },
  tshirt: {
    id: "tshirt",
    name: "T-shirt sizes",
    description: "Quick, conversational sizing without numbers.",
    cards: ["XS", "S", "M", "L", "XL", "XXL", "?", "☕"],
  },
};

export const DEFAULT_DECK_ID = "fibonacci";

export function getDeck(deckId) {
  return DECKS[deckId] ?? DECKS[DEFAULT_DECK_ID];
}
