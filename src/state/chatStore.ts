import { create } from "zustand";
import { chatTransport } from "@/services";
import { getMessagesForRoom } from "@/services/p2p/HolepunchChatTransport";
import { assertCanSendLive } from "@/services/protocol/composerGate";
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
    const rooms = await chatTransport.listRooms();
    set({ rooms, loadingRooms: false });
  },

  async openRoom(roomId) {
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
      const restored = await restoreRoomSession(roomId);
      if (restored) transportRoom = restored;
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
          }
        : undefined,
    });
    set((s) => ({ rooms: [...s.rooms.filter((r) => r.id !== room.id), room] }));
    return room;
  },

  async send(roomId, text) {
    const room =
      get().rooms.find((r) => r.id === roomId) ??
      (await chatTransport.getRoom(roomId));
    if (!room) throw new Error("Room not found.");
    assertCanSendLive(room.lifecycleStatus);
    // Transport notify → subscribeRoom appends; do not append here (avoids doubles).
    const msg = await chatTransport.sendMessage(roomId, text);
    set((s) => ({
      rooms: s.rooms.map((r) =>
        r.id === roomId ? { ...r, lastMessageAt: msg.createdAt } : r,
      ),
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
      const list = (s.messagesByRoom[roomId] ?? []).map((m) =>
        m.id === targetMessageId ? { ...m, text, editedAt: msg.createdAt } : m,
      );
      // Edit envelope itself arrives via subscribe; only patch the target text here.
      return {
        messagesByRoom: {
          ...s.messagesByRoom,
          [roomId]: list,
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
      const list = (s.messagesByRoom[roomId] ?? []).map((m) =>
        m.id === targetMessageId
          ? {
              ...m,
              text: "",
              deletedAt: msg.createdAt,
              kind: "delete" as const,
            }
          : m,
      );
      return {
        messagesByRoom: {
          ...s.messagesByRoom,
          [roomId]: list,
        },
      };
    });
  },

  async retryConnect(roomId) {
    const room = await chatTransport.retryConnect(roomId);
    set((s) => ({
      rooms: [...s.rooms.filter((r) => r.id !== roomId), room],
    }));
    return room;
  },

  subscribeRoom(roomId) {
    const unsub = chatTransport.subscribe(roomId, (msg) => {
      set((s) => {
        const prev = s.messagesByRoom[roomId] ?? [];
        if (prev.some((m) => m.id === msg.id)) return s;
        return {
          messagesByRoom: {
            ...s.messagesByRoom,
            [roomId]: [...prev, msg],
          },
        };
      });
    });
    return unsub;
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
