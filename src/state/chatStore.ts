import { create } from "zustand";
import { chatTransport, smartMessageService } from "@/services";
import { mergeContentMessage } from "@/services/p2p/chatMessageMerge";
import {
  getMessagesForRoom,
  ingestChatRelay,
  relayMessageId,
  subscribeRoomState,
} from "@/services/p2p/HolepunchChatTransport";
import {
  assertCanSendLive,
  assertCanSendMessages,
} from "@/services/protocol/composerGate";
import type { ChatMessage, ChatRoom } from "@/types/models";

type ChatStore = {
  rooms: ChatRoom[];
  messagesByRoom: Record<string, ChatMessage[]>;
  activeRoomId: string | null;
  loadingRooms: boolean;
  loadRooms: () => Promise<void>;
  openRoom: (roomId: string) => Promise<ChatRoom | null>;
  bootstrapRoom: (
    contactId: string,
    bootstrap?: {
      roomId: string;
      roomKeyRef: string;
      bootstrapSource: ChatRoom["bootstrapSource"];
      lifecycleStatus?: ChatRoom["lifecycleStatus"];
      inviteId?: string;
      inviteExpiry?: number;
      roomTtl?: number;
      roomTopic?: ChatRoom["roomTopic"];
    },
  ) => Promise<ChatRoom>;
  send: (roomId: string, text: string) => Promise<void>;
  sendReaction: (
    roomId: string,
    targetMessageId: string,
    reaction: string,
  ) => Promise<void>;
  editMessage: (
    roomId: string,
    targetMessageId: string,
    text: string,
  ) => Promise<void>;
  deleteMessage: (roomId: string, targetMessageId: string) => Promise<void>;
  retryConnect: (roomId: string) => Promise<ChatRoom>;
  /** Scan L1 chat.relay into rooms (dedupe by roomId+sentAt+text). */
  refreshRelays: () => Promise<void>;
  subscribeRoom: (roomId: string) => () => void;
  setMessages: (roomId: string, msgs: ChatMessage[]) => void;
};

import { uid } from "@/utils/format";

export const useChatStore = create<ChatStore>((set, get) => ({
  rooms: [],
  messagesByRoom: {},
  activeRoomId: null,
  loadingRooms: false,

  async loadRooms() {
    set({ loadingRooms: true });
    try {
      const { useContactsStore } = await import("@/state/contactsStore");
      await useContactsStore.getState().retireExpiredRooms();
    } catch {
      /* contacts may not be ready */
    }
    const { isRoomRevoked, isInviteRevoked } = await import(
      "@/services/p2p/revokedRoomsStore"
    );
    const { pruneRoomsForMissingContacts } = await import(
      "@/services/p2p/roomChainRestore"
    );
    const { shouldRetireCatalogRoom, peekCatalogRoom } = await import(
      "@/services/p2p/roomCatalogStore"
    );
    // Seed catalog from persisted invites / contact.roomId (same-device session).
    try {
      const { useContactsStore } = await import("@/state/contactsStore");
      const { contacts, invites } = useContactsStore.getState();
      pruneRoomsForMissingContacts(contacts);
      for (const inv of invites) {
        if (
          inv.status !== "sent" &&
          inv.status !== "received" &&
          inv.status !== "accepted"
        ) {
          continue;
        }
        if (isRoomRevoked(inv.roomId) || isInviteRevoked(inv.inviteId)) {
          continue;
        }
        // Skip rooms already due for retirement — retireExpiredRooms ran first.
        const catalogEntry = peekCatalogRoom(inv.roomId);
        if (catalogEntry && shouldRetireCatalogRoom(catalogEntry)) continue;
        try {
          await chatTransport.createRoom({
            contactId: inv.contactId,
            bootstrap: {
              roomId: inv.roomId,
              roomKeyRef: `key:${inv.roomId}`,
              bootstrapSource: "conceal-smart-message",
              lifecycleStatus:
                inv.status === "accepted" ? "accepted" : "pending",
              inviteId: inv.inviteId,
              inviteExpiry: inv.inviteExpiry,
              roomTtl: inv.roomTtl,
              roomTopic: inv.roomTopic,
            },
          });
        } catch {
          /* revoked / invalid — skip */
        }
      }
      for (const c of contacts) {
        if (!c.roomId) continue;
        if (isRoomRevoked(c.roomId)) continue;
        const inv = invites.find((i) => i.roomId === c.roomId);
        // Skip rooms already due for retirement.
        const catalogEntry = peekCatalogRoom(c.roomId);
        if (catalogEntry && shouldRetireCatalogRoom(catalogEntry)) continue;
        try {
          await chatTransport.createRoom({
            contactId: c.id,
            bootstrap: {
              roomId: c.roomId,
              roomKeyRef: `key:${c.roomId}`,
              bootstrapSource: "conceal-smart-message",
              lifecycleStatus:
                c.inviteStatus === "accepted" ? "accepted" : "pending",
              inviteId: inv?.inviteId,
              inviteExpiry: inv?.inviteExpiry,
              roomTtl: inv?.roomTtl,
              roomTopic: inv?.roomTopic,
            },
          });
        } catch {
          /* revoked / invalid — skip */
        }
      }
    } catch {
      /* contacts may not be ready */
    }
    const rooms = (await chatTransport.listRooms()).filter(
      (r) => !isRoomRevoked(r.id),
    );
    set({ rooms, loadingRooms: false });
  },

  async openRoom(roomId) {
    const { isRoomRevoked } = await import("@/services/p2p/revokedRoomsStore");
    if (isRoomRevoked(roomId)) {
      set((s) => ({
        rooms: s.rooms.filter((r) => r.id !== roomId),
        activeRoomId: s.activeRoomId === roomId ? null : s.activeRoomId,
      }));
      return null;
    }
    // Prefer live transport state over a stale store copy (Alice handoff).
    let transportRoom = await chatTransport.getRoom(roomId);
    if (
      !transportRoom ||
      transportRoom.lifecycleStatus === "pending" ||
      transportRoom.lifecycleStatus === "accepted" ||
      transportRoom.peerStatus === "offline"
    ) {
      const { restoreRoomSession } = await import(
        "@/services/p2p/HolepunchChatTransport"
      );
      const restored = await restoreRoomSession(roomId, {
        backgroundConnect: true,
      });
      if (restored) transportRoom = restored;
    }
    // Re-check: leave may have completed while restore was in flight.
    if (isRoomRevoked(roomId)) {
      set((s) => ({
        rooms: s.rooms.filter((r) => r.id !== roomId),
        activeRoomId: s.activeRoomId === roomId ? null : s.activeRoomId,
      }));
      return null;
    }
    if (transportRoom) {
      set((s) => ({
        rooms: [...s.rooms.filter((r) => r.id !== roomId), transportRoom!],
        activeRoomId: roomId,
        messagesByRoom: {
          ...s.messagesByRoom,
          [roomId]: getMessagesForRoom(roomId),
        },
      }));
      return transportRoom;
    }
    try {
      const room = await chatTransport.joinRoom(roomId);
      if (isRoomRevoked(roomId)) return null;
      set((s) => ({
        rooms: [...s.rooms.filter((r) => r.id !== roomId), room],
        activeRoomId: roomId,
        messagesByRoom: {
          ...s.messagesByRoom,
          [roomId]: getMessagesForRoom(roomId),
        },
      }));
      return room;
    } catch {
      return null;
    }
  },

  async bootstrapRoom(contactId, bootstrap) {
    if (bootstrap?.roomId) {
      const { isRoomRevoked } = await import(
        "@/services/p2p/revokedRoomsStore"
      );
      if (isRoomRevoked(bootstrap.roomId)) {
        throw new Error("Room revoked.");
      }
    }
    const room = await chatTransport.createRoom({
      contactId,
      bootstrap: bootstrap
        ? {
            roomId: bootstrap.roomId,
            roomKeyRef: bootstrap.roomKeyRef,
            bootstrapSource: bootstrap.bootstrapSource,
            lifecycleStatus: bootstrap.lifecycleStatus,
            inviteId: bootstrap.inviteId,
            inviteExpiry: bootstrap.inviteExpiry,
            roomTtl: bootstrap.roomTtl,
            roomTopic: bootstrap.roomTopic,
          }
        : undefined,
    });
    set((s) => ({ rooms: [...s.rooms.filter((r) => r.id !== room.id), room] }));
    return room;
  },

  async retryConnect(roomId) {
    const { isRoomRevoked } = await import("@/services/p2p/revokedRoomsStore");
    if (isRoomRevoked(roomId)) {
      set((s) => ({ rooms: s.rooms.filter((r) => r.id !== roomId) }));
      throw new Error("Room revoked.");
    }
    const room = await chatTransport.retryConnect(roomId);
    set((s) => ({
      rooms: [...s.rooms.filter((r) => r.id !== roomId), room],
    }));
    return room;
  },

  async refreshRelays() {
    const inbound = await smartMessageService.fetchIncomingRelays();
    const touched = new Set<string>();
    const { noteRelayIngested, finishRelayBootstrap } = (
      await import("@/state/notificationStore")
    ).useNotificationStore.getState();
    const { shouldSuppressRelayBadge } = await import(
      "@/services/notifications/relayNotification"
    );
    const activeRoomId = get().activeRoomId;
    const pathname =
      typeof window !== "undefined" ? window.location.pathname : "";
    const maybeNoteRelay = (messageId: string, roomId: string) => {
      if (shouldSuppressRelayBadge(roomId, activeRoomId, pathname)) return;
      noteRelayIngested(messageId, roomId);
    };
    for (const { relay } of inbound) {
      const msg = await ingestChatRelay(relay);
      if (msg) {
        touched.add(msg.roomId);
        maybeNoteRelay(msg.id, msg.roomId);
      } else {
        const id = relayMessageId(relay.roomId, relay.sentAt, relay.text);
        maybeNoteRelay(id, relay.roomId);
      }
    }
    finishRelayBootstrap();
    set((s) => {
      const roomIds = new Set([
        ...Object.keys(s.messagesByRoom),
        ...touched,
        ...s.rooms.map((r) => r.id),
      ]);
      let changed = false;
      const next = { ...s.messagesByRoom };
      for (const roomId of roomIds) {
        const fromTransport = getMessagesForRoom(roomId);
        if (fromTransport.length === 0) continue;
        const prev = next[roomId] ?? [];
        const byId = new Map(prev.map((m) => [m.id, m]));
        for (const m of fromTransport) {
          const existing = byId.get(m.id);
          if (
            !existing ||
            existing.status !== m.status ||
            existing.channel !== m.channel
          ) {
            byId.set(m.id, m);
            changed = true;
          }
        }
        next[roomId] = [...byId.values()];
      }
      return changed ? { messagesByRoom: next } : s;
    });
  },

  async send(roomId, text) {
    const room =
      get().rooms.find((r) => r.id === roomId) ??
      (await chatTransport.getRoom(roomId));
    if (!room) throw new Error("Room not found.");
    assertCanSendMessages(room.lifecycleStatus);
    // Transport notify → subscribeRoom appends; do not append here (avoids doubles).
    const msg = await chatTransport.sendMessage(roomId, text);
    set((s) => ({
      rooms: s.rooms.map((r) =>
        r.id === roomId ? { ...r, lastMessageAt: msg.createdAt } : r,
      ),
      messagesByRoom: {
        ...s.messagesByRoom,
        [roomId]: getMessagesForRoom(roomId),
      },
    }));
  },

  async sendReaction(roomId, targetMessageId, reaction) {
    if (!chatTransport.sendContent) {
      throw new Error("Transport does not support content envelopes.");
    }
    const room =
      get().rooms.find((r) => r.id === roomId) ??
      (await chatTransport.getRoom(roomId));
    if (!room) throw new Error("Room not found.");
    assertCanSendLive(room.lifecycleStatus);
    await chatTransport.sendContent(roomId, {
      schemaVersion: 1,
      messageId: uid("m"),
      clientId: uid("c"),
      sentAt: new Date().toISOString(),
      kind: "reaction",
      targetMessageId,
      reaction,
    });
  },

  async editMessage(roomId, targetMessageId, text) {
    if (!chatTransport.sendContent) {
      throw new Error("Transport does not support content envelopes.");
    }
    const room =
      get().rooms.find((r) => r.id === roomId) ??
      (await chatTransport.getRoom(roomId));
    if (!room) throw new Error("Room not found.");
    assertCanSendLive(room.lifecycleStatus);
    const msg = await chatTransport.sendContent(roomId, {
      schemaVersion: 1,
      messageId: uid("m"),
      clientId: uid("c"),
      sentAt: new Date().toISOString(),
      kind: "edit",
      targetMessageId,
      text,
    });
    set((s) => {
      const prev = s.messagesByRoom[roomId] ?? [];
      const editEnvelope: ChatMessage = {
        id: msg.id,
        roomId,
        direction: "out",
        text,
        createdAt: msg.createdAt,
        status: "delivered",
        kind: "edit",
        targetMessageId,
        editedAt: msg.createdAt,
      };
      return {
        messagesByRoom: {
          ...s.messagesByRoom,
          [roomId]: mergeContentMessage(prev, editEnvelope),
        },
      };
    });
  },

  async deleteMessage(roomId, targetMessageId) {
    if (!chatTransport.sendContent) {
      throw new Error("Transport does not support content envelopes.");
    }
    const room =
      get().rooms.find((r) => r.id === roomId) ??
      (await chatTransport.getRoom(roomId));
    if (!room) throw new Error("Room not found.");
    assertCanSendLive(room.lifecycleStatus);
    const msg = await chatTransport.sendContent(roomId, {
      schemaVersion: 1,
      messageId: uid("m"),
      clientId: uid("c"),
      sentAt: new Date().toISOString(),
      kind: "delete",
      targetMessageId,
    });
    set((s) => {
      const prev = s.messagesByRoom[roomId] ?? [];
      const deleteEnvelope: ChatMessage = {
        id: msg.id,
        roomId,
        direction: "out",
        text: "",
        createdAt: msg.createdAt,
        status: "delivered",
        kind: "delete",
        targetMessageId,
        deletedAt: msg.createdAt,
      };
      return {
        messagesByRoom: {
          ...s.messagesByRoom,
          [roomId]: mergeContentMessage(prev, deleteEnvelope),
        },
      };
    });
  },

  subscribeRoom(roomId) {
    const unsub = chatTransport.subscribe(roomId, (msg) => {
      set((s) => {
        const prev = s.messagesByRoom[roomId] ?? [];
        return {
          messagesByRoom: {
            ...s.messagesByRoom,
            [roomId]: mergeContentMessage(prev, msg),
          },
        };
      });
    });
    const unsubRoom = subscribeRoomState(roomId, (room) => {
      set((s) => ({
        rooms: s.rooms.some((r) => r.id === roomId)
          ? s.rooms.map((r) => (r.id === roomId ? room : r))
          : [...s.rooms, room],
      }));
    });
    return () => {
      unsub();
      unsubRoom();
    };
  },

  setMessages(roomId, msgs) {
    set((s) => {
      const prev = s.messagesByRoom[roomId];
      if (prev === msgs) return s;
      return {
        messagesByRoom: { ...s.messagesByRoom, [roomId]: msgs },
      };
    });
  },
}));
