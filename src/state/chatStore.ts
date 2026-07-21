import { create } from "zustand";
import { chatTransport } from "@/services";
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
    },
  ) => Promise<ChatRoom>;
  send: (roomId: string, text: string) => Promise<void>;
  subscribeRoom: (roomId: string) => () => void;
  setMessages: (roomId: string, msgs: ChatMessage[]) => void;
};

import { getMessagesForRoom } from "@/services/mock/MockChatTransport";
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
    const existing = get().rooms.find((r) => r.id === roomId);
    if (existing) {
      set({ activeRoomId: roomId });
      set({
        messagesByRoom: {
          ...get().messagesByRoom,
          [roomId]: getMessagesForRoom(roomId),
        },
      });
      return existing;
    }
    const room = await chatTransport.joinRoom(roomId);
    set((s) => ({
      rooms: [...s.rooms.filter((r) => r.id !== roomId), room],
      activeRoomId: roomId,
    }));
    set({
      messagesByRoom: {
        ...get().messagesByRoom,
        [roomId]: getMessagesForRoom(roomId),
      },
    });
    return room;
  },

  async bootstrapRoom(contactId, bootstrap) {
    const room = await chatTransport.createRoom({
      contactId,
      bootstrap: bootstrap
        ? {
            roomId: bootstrap.roomId,
            roomKeyRef: bootstrap.roomKeyRef,
            bootstrapSource: bootstrap.bootstrapSource,
          }
        : undefined,
    });
    set((s) => ({ rooms: [...s.rooms.filter((r) => r.id !== room.id), room] }));
    return room;
  },

  async send(roomId, text) {
    const msg = await chatTransport.sendMessage(roomId, text);
    set((s) => ({
      messagesByRoom: {
        ...s.messagesByRoom,
        [roomId]: [...(s.messagesByRoom[roomId] ?? []), msg],
      },
    }));
  },

  subscribeRoom(roomId) {
    const unsub = chatTransport.subscribe(roomId, (msg) => {
      set((s) => ({
        messagesByRoom: {
          ...s.messagesByRoom,
          [roomId]: [...(s.messagesByRoom[roomId] ?? []), msg],
        },
      }));
    });
    return unsub;
  },

  setMessages(roomId, msgs) {
    set((s) => ({ messagesByRoom: { ...s.messagesByRoom, [roomId]: msgs } }));
  },
}));

export { uid };
