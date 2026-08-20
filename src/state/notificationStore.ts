import { create } from "zustand";
import { getContactInviteActionCount } from "@/services/contacts/inviteQueue";
import { markNotificationEventsRead } from "@/services/notifications/notificationEventLedger";
import { syncNativeBadgeFromLedger } from "@/services/notifications/publishBackgroundNotification";
import {
  contactRelayCount,
  isActiveRoomForRelayNav,
} from "@/services/notifications/relayNotification";
import type { ChatRoom, Contact, SmartMessageInvite } from "@/types/models";

type NotificationStore = {
  contactQueueBaseline: Record<string, number>;
  registerPending: Record<string, boolean>;
  registerAcknowledged: Record<string, boolean>;
  pendingRoomAcknowledged: Record<string, boolean>;
  roomRelayUnread: Record<string, number>;
  relayBootstrapDone: boolean;
  relaySeenIds: Record<string, true>;

  resetSession: () => void;
  markContactSeen: (contactId: string, queueCount: number) => void;
  markRoomSeen: (roomId: string) => void;
  pingRegister: (contactId: string) => void;
  noteRelayIngested: (messageId: string, roomId: string) => void;
  finishRelayBootstrap: () => void;

  contactInviteBadge: (contactId: string, queueCount: number) => number;
  contactRegisterBadge: (contactId: string) => boolean;
  contactRelayBadge: (contactId: string, rooms: ChatRoom[]) => number;
  roomPendingBadge: (roomId: string, isPending: boolean) => boolean;
  roomRelayBadge: (roomId: string) => number;
  anyContactBadge: (
    contacts: Contact[],
    invites: SmartMessageInvite[],
    rooms: ChatRoom[],
  ) => boolean;
  anyRoomBadge: (rooms: ChatRoom[]) => boolean;
};

const initialState = {
  contactQueueBaseline: {} as Record<string, number>,
  registerPending: {} as Record<string, boolean>,
  registerAcknowledged: {} as Record<string, boolean>,
  pendingRoomAcknowledged: {} as Record<string, boolean>,
  roomRelayUnread: {} as Record<string, number>,
  relayBootstrapDone: false,
  relaySeenIds: {} as Record<string, true>,
};

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  ...initialState,

  resetSession: () => set({ ...initialState }),

  markContactSeen: (contactId, queueCount) => {
    set((s) => ({
      contactQueueBaseline: {
        ...s.contactQueueBaseline,
        [contactId]: queueCount,
      },
      registerAcknowledged: {
        ...s.registerAcknowledged,
        [contactId]: true,
      },
    }));
    if (markNotificationEventsRead({ contactId }) > 0) {
      syncNativeBadgeFromLedger();
    }
  },

  markRoomSeen: (roomId) => {
    set((s) => ({
      pendingRoomAcknowledged: {
        ...s.pendingRoomAcknowledged,
        [roomId]: true,
      },
      roomRelayUnread: { ...s.roomRelayUnread, [roomId]: 0 },
    }));
    if (markNotificationEventsRead({ roomId }) > 0) {
      syncNativeBadgeFromLedger();
    }
  },

  pingRegister: (contactId) => {
    set((s) => ({
      registerPending: { ...s.registerPending, [contactId]: true },
      registerAcknowledged: { ...s.registerAcknowledged, [contactId]: false },
    }));
  },

  noteRelayIngested: (messageId, roomId) => {
    const s = get();
    if (s.relaySeenIds[messageId]) return;
    const relaySeenIds = { ...s.relaySeenIds, [messageId]: true as const };
    if (!s.relayBootstrapDone) {
      set({ relaySeenIds });
      return;
    }
    set({
      relaySeenIds,
      roomRelayUnread: {
        ...s.roomRelayUnread,
        [roomId]: (s.roomRelayUnread[roomId] ?? 0) + 1,
      },
    });
  },

  finishRelayBootstrap: () => {
    if (get().relayBootstrapDone) return;
    set({ relayBootstrapDone: true });
  },

  contactInviteBadge: (contactId, queueCount) => {
    const baseline = get().contactQueueBaseline[contactId] ?? 0;
    return queueCount > baseline ? queueCount : 0;
  },

  contactRegisterBadge: (contactId) => {
    const s = get();
    return Boolean(
      s.registerPending[contactId] && !s.registerAcknowledged[contactId],
    );
  },

  roomPendingBadge: (roomId, isPending) => {
    if (!isPending) return false;
    return !get().pendingRoomAcknowledged[roomId];
  },

  roomRelayBadge: (roomId) => get().roomRelayUnread[roomId] ?? 0,

  contactRelayBadge: (contactId, rooms) =>
    contactRelayCount(contactId, rooms, get().roomRelayUnread),

  anyContactBadge: (contacts, invites, rooms) => {
    const s = get();
    for (const contact of contacts) {
      const actionCount = getContactInviteActionCount(contact, invites);
      if (s.contactInviteBadge(contact.id, actionCount) > 0) return true;
      if (s.contactRegisterBadge(contact.id)) return true;
      if (s.contactRelayBadge(contact.id, rooms) > 0) return true;
    }
    return false;
  },

  anyRoomBadge: (rooms) => {
    const s = get();
    for (const room of rooms) {
      if (!isActiveRoomForRelayNav(room)) continue;
      if (s.roomRelayBadge(room.id) > 0) return true;
    }
    return false;
  },
}));
