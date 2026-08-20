/** Resolve roomTtl from live room, invites, catalog, handshake stash, or session. */
import { getHandshakeForInvite } from "@/services/conceal/ConcealSmartMessageAdapter";
import { loadPendingInitiatorKeys } from "@/services/contacts/contactsPersistence";
import { loadCatalogRoom } from "@/services/p2p/roomCatalogStore";
import { loadRoomSession } from "@/services/p2p/roomSessionStore";

export function resolveRoomTtl(input: {
  roomId: string;
  roomTtl?: number;
  inviteId?: string;
  inviteRecordTtl?: number;
}): number | undefined {
  if (input.roomTtl) return input.roomTtl;
  if (input.inviteRecordTtl) return input.inviteRecordTtl;
  const catalogTtl = loadCatalogRoom(input.roomId)?.roomTtl;
  if (catalogTtl) return catalogTtl;
  if (input.inviteId) {
    const fromHandshake = getHandshakeForInvite(input.inviteId)?.roomTtl;
    if (fromHandshake) return fromHandshake;
  }
  const fromSession = loadRoomSession(input.roomId)?.contract.roomTtl;
  if (fromSession) return fromSession;
  for (const rec of loadPendingInitiatorKeys()) {
    if (rec.roomId === input.roomId && rec.handshake.roomTtl) {
      return rec.handshake.roomTtl;
    }
  }
  return undefined;
}
