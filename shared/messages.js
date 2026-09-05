import { ROOM_LIMITS } from "./limits.js";

export const FACILITATOR_ONLY = Object.freeze({
  deleteRoom: "Only the facilitator can delete the room.",
  regenerateRecovery: "Only the facilitator can create a new recovery link.",
  changeSettings: "Only the facilitator can change room settings.",
  pauseReactions: "Only the facilitator can pause reactions.",
  clearReactions: "Only the facilitator can clear reactions.",
  lockRoom: "Only the facilitator can lock the room.",
  changeRoles: "Only the facilitator can change participant roles.",
  transferOwnership: "Only the facilitator can transfer ownership.",
  removeParticipants: "Only the facilitator can remove participants.",
  addItems: "Only the facilitator can add estimation items.",
  removeItems: "Only the facilitator can remove estimation items.",
  editItems: "Only the facilitator can edit estimation items.",
  reorderItems: "Only the facilitator can reorder estimation items.",
  closeRoom: "Only the facilitator can close the room.",
  startRound: "Only the facilitator can start a round.",
  editItemTitle: "Only the facilitator can edit the item title.",
  restartVoting: "Only the facilitator can restart voting.",
  cancelRound: "Only the facilitator can cancel a round.",
  revealCards: "Only the facilitator can reveal cards.",
  finalizeEstimate: "Only the facilitator can finalize an estimate.",
});

// Numbers baked in, so changing a limit fails the catalog test and gets
// re-translated rather than silently reverting to English.
export const LIMIT_MESSAGES = Object.freeze({
  participants: `This room has reached its ${ROOM_LIMITS.participants}-person limit.`,
  pendingItems: `A room can have at most ${ROOM_LIMITS.pendingItems} pending items.`,
  cards: `A deck can contain at most ${ROOM_LIMITS.cards} cards.`,
});
