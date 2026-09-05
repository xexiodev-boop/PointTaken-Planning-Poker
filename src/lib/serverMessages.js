import { i18n } from "@lingui/core";
import { msg, t } from "@lingui/core/macro";

// The worker replies and broadcasts in English. Lingui message ids are the
// English source strings, so running a server message through i18n._() returns
// its translation when one exists and the original text untouched otherwise.
// Nothing breaks if the worker and client ever disagree on the exact wording.
export function localizeServerMessage(message) {
  return message ? i18n._(message) : message;
}

// Announcements that interpolate participant names carry a machine-readable
// kind + params next to the prebuilt English message, so they can be rebuilt
// in the viewer's language instead of string-matched.
export function localizeAnnouncement(announcement) {
  if (announcement.kind === "facilitator_recovered") {
    const { name } = announcement.params;
    return t`${name} recovered facilitator access.`;
  }
  if (announcement.kind === "facilitator_reclaimed") {
    const { name } = announcement.params;
    return t`${name} took facilitation back.`;
  }
  if (announcement.kind === "facilitator_auto_transferred") {
    const { from, to } = announcement.params;
    return t`${from} was away, so ${to} is now the facilitator.`;
  }
  return localizeServerMessage(announcement.message);
}

// Every fixed string the worker can send, mirrored as catalog entries so
// `lingui extract` picks them up. Update this list when worker copy changes;
// a missed entry only means that one message stays in English.
export const SERVER_MESSAGES = [
  msg`A deck can contain at most 16 cards.`,
  msg`A deck needs at least two cards.`,
  msg`A room can have at most 50 pending items.`,
  msg`A round needs at least one voter.`,
  msg`Add at least one item.`,
  msg`Add no more than 100 items at a time.`,
  msg`Cards must be provided as a list.`,
  msg`Choose a card before confirming.`,
  msg`Choose another person to become facilitator.`,
  msg`Choose or enter a final estimate.`,
  msg`Content-Type must be application/json.`,
  msg`Deck cards must be unique.`,
  msg`Enter a task title.`,
  msg`Enter an item title.`,
  msg`Facilitator ownership can only transfer between rounds.`,
  msg`Finish the current round before closing the room.`,
  msg`Finish the current round first.`,
  msg`Give reactions a moment to breathe.`,
  msg`Invalid room identity.`,
  msg`Items can only be changed between rounds.`,
  msg`Items can only be reordered between rounds.`,
  msg`Items must be provided as a list.`,
  msg`Keep at least one reaction available.`,
  msg`Not found`,
  msg`Only the facilitator can add estimation items.`,
  msg`Only the facilitator can cancel a round.`,
  msg`Only the facilitator can change participant roles.`,
  msg`Only the facilitator can change room settings.`,
  msg`Only the facilitator can clear reactions.`,
  msg`Only the facilitator can close the room.`,
  msg`Only the facilitator can create a new recovery link.`,
  msg`Only the facilitator can delete the room.`,
  msg`Only the facilitator can edit estimation items.`,
  msg`Only the facilitator can edit the item title.`,
  msg`Only the facilitator can finalize an estimate.`,
  msg`Only the facilitator can lock the room.`,
  msg`Only the facilitator can pause reactions.`,
  msg`Only the facilitator can remove estimation items.`,
  msg`Only the facilitator can remove participants.`,
  msg`Only the facilitator can reorder estimation items.`,
  msg`Only the facilitator can restart voting.`,
  msg`Only the facilitator can reveal cards.`,
  msg`Only the facilitator can start a round.`,
  msg`Only the facilitator can transfer ownership.`,
  msg`Only the person who created this room can take facilitation back.`,
  msg`Reaction palette must be a list.`,
  msg`Reactions are currently paused.`,
  msg`Request body must be valid JSON.`,
  msg`Request is too large.`,
  msg`Request origin is not allowed.`,
  msg`Reveal the cards first.`,
  msg`Roles can only change between rounds.`,
  msg`Room already exists.`,
  msg`Room message is too large.`,
  msg`Room settings can only change between rounds.`,
  msg`Something went wrong. Please try again.`,
  msg`That action could not be completed.`,
  msg`That card is not in this deck.`,
  msg`That item is already in the estimation queue.`,
  msg`That item is no longer pending.`,
  msg`That participant cannot be changed.`,
  msg`That participant cannot be removed.`,
  msg`That pending item was not found.`,
  msg`That reaction is not available.`,
  msg`That recovery code is not valid for this room.`,
  msg`The pending item order is no longer current.`,
  msg`There is no active round to cancel.`,
  msg`There is no active round to edit.`,
  msg`There is no active round to restart.`,
  msg`There is no voting round to reveal.`,
  msg`This room has been closed.`,
  msg`This room has expired or does not exist.`,
  msg`This room has reached its 20-person limit.`,
  msg`This room is closed and can only be viewed.`,
  msg`This room is not accepting new participants.`,
  msg`Too many attempts. Try again shortly.`,
  msg`Too many room actions. Slow down and try again.`,
  msg`Too many rooms created. Try again shortly.`,
  msg`Unknown participant role.`,
  msg`Unknown room action.`,
  msg`Unknown suggestion algorithm.`,
  msg`Unsupported reveal timer.`,
  msg`Voting is not open.`,
  msg`You are already the facilitator.`,
  msg`You joined after this round started and can vote in the next one.`,
  msg`Your room identity is no longer valid.`,
];
