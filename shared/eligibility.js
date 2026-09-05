// Shared so the worker's eligible list and the client's pre-round check cannot
// disagree.
export function isEligibleVoter(participant, settings) {
  if (participant.role === "observer") return false;
  if (participant.role === "facilitator") return settings?.facilitatorVotes !== false;
  return true;
}

export function eligibleVoters(participants, settings) {
  return participants.filter((participant) => isEligibleVoter(participant, settings));
}
