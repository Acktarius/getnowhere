/**
 * Resolve ids for L1 chat.revoke vs local-only room retirement.
 * @see docs/security/p2pchatprotocol.md
 */
import type { CatalogRoom } from "@/services/p2p/roomCatalogStore";
import type { ChatRoom, Contact, SmartMessageInvite } from "@/types/models";

export type RoomRevokeIds = {
  contactId?: string;
  inviteId?: string;
};

export function resolveRoomRevokeIds(input: {
  roomId: string;
  invites: SmartMessageInvite[];
  contacts: Contact[];
  room?: ChatRoom | null;
  catalog?: CatalogRoom | null;
}): RoomRevokeIds {
  const inv = input.invites.find((i) => i.roomId === input.roomId);
  const contactId =
    inv?.contactId ||
    input.room?.contactId ||
    input.catalog?.contactId ||
    input.contacts.find((c) => c.roomId === input.roomId)?.id;
  const inviteId =
    inv?.inviteId || input.room?.inviteId || input.catalog?.inviteId;
  return { contactId, inviteId };
}

/** True when an on-chain room_revoked smart message can be composed. */
export function canBroadcastRoomRevoke(ids: RoomRevokeIds): boolean {
  return Boolean(ids.contactId && ids.inviteId);
}
