import { isRoomRevoked } from "@/services/p2p/revokedRoomsStore";
import { listCatalogRooms } from "@/services/p2p/roomCatalogStore";
import { useChatStore } from "@/state/chatStore";
import { useContactsStore } from "@/state/contactsStore";

/**
 * Landing tab after unlocking a stored wallet.
 * Wallet when the address book and every room list are empty.
 */
export function postUnlockPath(): "/wallet" | "/chats" {
  const contacts = useContactsStore.getState().contacts;
  const hasContact = contacts.length > 0;
  const hasRoom =
    contacts.some((c) => Boolean(c.roomId)) ||
    useChatStore.getState().rooms.some((r) => !isRoomRevoked(r.id)) ||
    listCatalogRooms().some((r) => !isRoomRevoked(r.id));
  return hasContact || hasRoom ? "/chats" : "/wallet";
}
