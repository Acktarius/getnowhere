import type { Contact, SmartMessageInvite } from "@/types/models";

export type InviteQueue = {
  inQueue: boolean;
  count: number;
  newest: SmartMessageInvite | undefined;
  others: SmartMessageInvite[];
};

/** Pending received invites for a contact — newest first. @see docs/features/chat-relay.md */
export function getInviteQueue(
  contactId: string,
  invites: SmartMessageInvite[],
): InviteQueue {
  const pending = invites
    .filter((i) => i.contactId === contactId && i.status === "received")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    inQueue: pending.length > 0,
    count: pending.length,
    newest: pending[0],
    others: pending.slice(1),
  };
}

/**
 * Actionable invite count for UI badges — mirrors Contact detail Accept logic.
 * Falls back to contact.inviteStatus when chain scan has not merged invites yet.
 */
export function getContactInviteActionCount(
  contact: Pick<Contact, "id" | "inviteStatus">,
  invites: SmartMessageInvite[],
): number {
  const queue = getInviteQueue(contact.id, invites);
  if (queue.count > 0) return queue.count;
  if (contact.inviteStatus === "received") return 1;
  return 0;
}

export function contactInviteIsZeroConf(
  contact: Pick<Contact, "id" | "inviteStatus">,
  invites: SmartMessageInvite[],
): boolean {
  const queue = getInviteQueue(contact.id, invites);
  if (queue.newest?.zeroConf) return true;
  return contact.inviteStatus === "received" && queue.count === 0;
}

export function hasPendingRoomInvite(
  roomId: string,
  invites: SmartMessageInvite[],
): boolean {
  return invites.some((i) => i.roomId === roomId && i.status === "received");
}

/**
 * True when periodic refreshInvites polling should remain active.
 * False once the contact is fully eligible with no pending inbound invite.
 * @see docs/features/lite-wallet.md
 */
export function shouldPollContactInvites(
  contact:
    | Pick<Contact, "id" | "relationshipStatus" | "inviteStatus">
    | undefined,
  invites: SmartMessageInvite[],
): boolean {
  if (!contact) return true;
  if (contact.relationshipStatus !== "eligible") return true;
  if (contact.inviteStatus === "received") return true;
  return getInviteQueue(contact.id, invites).inQueue;
}
