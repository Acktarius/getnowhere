import { isRelayEligibleStatus } from "@/services/protocol/roomLifecycle";
import type { ChatRoom } from "@/types/models";

/** Post-accept / live rooms only — L1′ relay cannot land on pending invites. */
export function isActiveRoomForRelayNav(room: ChatRoom): boolean {
  return (
    room.lifecycleStatus === "connected" ||
    isRelayEligibleStatus(room.lifecycleStatus)
  );
}

/** Skip relay unread when the user is on the chat room screen for this room. */
export function shouldSuppressRelayBadge(
  roomId: string,
  activeRoomId: string | null,
  pathname: string,
): boolean {
  if (activeRoomId !== roomId) return false;
  return (
    pathname === `/chats/${roomId}` || pathname.startsWith(`/chats/${roomId}/`)
  );
}

/** Sum relay unread across post-accept rooms for one contact. */
export function contactRelayCount(
  contactId: string,
  rooms: ChatRoom[],
  roomRelayUnread: Record<string, number>,
): number {
  let total = 0;
  for (const room of rooms) {
    if (room.contactId !== contactId) continue;
    if (!isActiveRoomForRelayNav(room)) continue;
    total += roomRelayUnread[room.id] ?? 0;
  }
  return total;
}
