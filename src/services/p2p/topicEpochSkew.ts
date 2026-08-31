/**
 * Topic epoch skew hints for invite UX.
 * @see docs/architecture/pairing-and-topics.md
 */
import { getHandshakeForInvite } from "@/services/conceal/ConcealSmartMessageAdapter";
import { getRelationshipTopicEpoch } from "@/services/p2p/relationshipTopicEpochStore";
import { deriveRelationshipId } from "@/services/protocol/ids";
import type { Contact, SmartMessageInvite } from "@/types/models";

export type TopicEpochSkewHint =
  | {
      kind: "local_ahead_of_invite";
      localEpoch: number;
      inviteEpoch: number;
    }
  | { kind: "peer_may_need_to_invite"; localEpoch: number };

/** Detect when local epoch may block a lower-epoch invite we sent. */
export async function detectTopicEpochSkew(
  contact: Contact,
  incomingInvite?: SmartMessageInvite,
): Promise<TopicEpochSkewHint | null> {
  if (!contact.paymentIdFrom || !contact.paymentIdTo) return null;
  const relationshipId = await deriveRelationshipId(
    contact.paymentIdFrom,
    contact.paymentIdTo,
  );
  const localEpoch = getRelationshipTopicEpoch(relationshipId);

  if (incomingInvite) {
    const handshake = getHandshakeForInvite(incomingInvite.inviteId);
    const inviteEpoch = handshake?.topicEpoch ?? 0;
    if (localEpoch > inviteEpoch) {
      return { kind: "local_ahead_of_invite", localEpoch, inviteEpoch };
    }
    return null;
  }

  if (localEpoch > 0) {
    return { kind: "peer_may_need_to_invite", localEpoch };
  }
  return null;
}

export function topicEpochSkewMessage(
  hint: TopicEpochSkewHint,
  alias: string,
): string {
  if (hint.kind === "local_ahead_of_invite") {
    return `Your discovery generation (${hint.localEpoch}) is ahead of ${alias}'s invite (${hint.inviteEpoch}). Accepting will align to their invite.`;
  }
  return `If ${alias} cannot connect after you invite, ask them to create the room instead (discovery generation ${hint.localEpoch}).`;
}
