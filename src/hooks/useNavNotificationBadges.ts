import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { isRoomRevoked } from "@/services/p2p/revokedRoomsStore";
import { useChatStore } from "@/state/chatStore";
import { useContactsStore } from "@/state/contactsStore";
import { useNotificationStore } from "@/state/notificationStore";

export function useNavNotificationBadges(): {
  contactsUnread: boolean;
  chatsUnread: boolean;
} {
  const location = useLocation();
  const contacts = useContactsStore((s) => s.contacts);
  const invites = useContactsStore((s) => s.invites);
  const rooms = useChatStore((s) => s.rooms);

  const visibleRooms = useMemo(
    () => rooms.filter((r) => !isRoomRevoked(r.id)),
    [rooms],
  );

  /** Invite pins live on contact rows — hide Contacts tab dot on the list itself. */
  const onContactsList = location.pathname === "/contacts";

  const contactsUnread = useNotificationStore(
    (s) => s.anyContactBadge(contacts, invites) && !onContactsList,
  );
  /** Chats tab dot = new L1′ relay on a post-accept room only. */
  const chatsUnread = useNotificationStore((s) => s.anyRoomBadge(visibleRooms));

  return { contactsUnread, chatsUnread };
}
