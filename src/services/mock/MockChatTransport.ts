import type { ChatMessage, ChatRoom } from "@/types/models";
import type { ChatTransport, RoomBootstrap } from "@/types/services";
import { sleep, uid } from "@/utils/format";

const rooms = new Map<string, ChatRoom>();
const messages = new Map<string, ChatMessage[]>();
const subscribers = new Map<string, Set<(m: ChatMessage) => void>>();

function roomKeyRef(roomId: string): string {
  return `rk_${roomId.slice(-12)}`;
}

export const MockChatTransport: ChatTransport = {
  async createRoom({
    contactId,
    bootstrap,
  }: {
    contactId: string;
    bootstrap?: RoomBootstrap;
  }) {
    await sleep(450);
    const id = bootstrap?.roomId ?? uid("room");
    const room: ChatRoom = {
      id,
      contactId,
      bootstrapSource: bootstrap?.bootstrapSource ?? "local-mock",
      roomKeyRef: bootstrap?.roomKeyRef ?? roomKeyRef(id),
      peerStatus: "connecting",
      lifecycleStatus: bootstrap?.lifecycleStatus ?? "pending",
      inviteId: bootstrap?.inviteId,
      inviteExpiry: bootstrap?.inviteExpiry,
      roomTtl: bootstrap?.roomTtl,
      createdAt: new Date().toISOString(),
    };
    rooms.set(id, room);
    messages.set(id, []);
    subscribers.set(id, new Set());
    // Simulate peer coming online.
    setTimeout(() => {
      const r = rooms.get(id);
      if (r) {
        r.peerStatus = "online";
        r.lastMessageAt = new Date().toISOString();
      }
    }, 1400);
    return room;
  },

  async joinRoom(roomId: string) {
    await sleep(400);
    const room = rooms.get(roomId);
    if (!room) throw new Error("Room not found");
    room.peerStatus = "connecting";
    setTimeout(() => {
      const r = rooms.get(roomId);
      if (r) r.peerStatus = "online";
    }, 900);
    return room;
  },

  async connect(contract) {
    const room = rooms.get(contract.roomId);
    if (!room) {
      const created: ChatRoom = {
        id: contract.roomId,
        contactId: "",
        bootstrapSource: "conceal-smart-message",
        roomKeyRef: contract.sessionId,
        peerStatus: "online",
        lifecycleStatus: "connected",
        inviteId: contract.inviteId,
        roomTtl: contract.roomTtl,
        createdAt: new Date().toISOString(),
      };
      rooms.set(contract.roomId, created);
      return created;
    }
    room.lifecycleStatus = "connected";
    room.peerStatus = "online";
    return room;
  },

  async disconnect(roomId) {
    const room = rooms.get(roomId);
    if (room) {
      room.lifecycleStatus = "closed";
      room.peerStatus = "offline";
    }
  },

  async retryConnect(roomId) {
    return this.connect({
      contractVersion: 1,
      roomId,
      relationshipId: "",
      inviteId: "",
      sessionId: "",
      cipherSuite: "CHACHA20_POLY1305_V1",
      sendKeyRef: "",
      recvKeyRef: "",
      nonceSeed: "",
      nonceStrategy: "counter_from_seed",
      sendCounter: 0,
      recvCounter: 0,
      peerRole: "initiator",
      transport: { kind: "holepunch", topicRef: roomId },
      roomTtl: Math.floor(Date.now() / 1000) + 86400,
      establishedAt: new Date().toISOString(),
    });
  },

  async sendMessage(roomId: string, text: string): Promise<ChatMessage> {
    const room = rooms.get(roomId);
    if (!room) throw new Error("Room not found");
    if (room.lifecycleStatus !== "connected") {
      throw new Error(
        "Cannot send until Holepunch-connected (accepted is not enough).",
      );
    }
    const msg: ChatMessage = {
      id: uid("msg"),
      roomId,
      direction: "out",
      text,
      createdAt: new Date().toISOString(),
      status: "sending",
    };
    const list = messages.get(roomId) ?? [];
    list.push(msg);
    messages.set(roomId, list);
    room.lastMessageAt = msg.createdAt;
    subscribers.get(roomId)?.forEach((h) => h(msg));
    await sleep(300);
    msg.status = "delivered";
    // Mock peer reply.
    if (Math.random() > 0.35) {
      await sleep(700 + Math.random() * 900);
      const reply: ChatMessage = {
        id: uid("msg"),
        roomId,
        direction: "in",
        text: pickReply(text),
        createdAt: new Date().toISOString(),
        status: "delivered",
      };
      const l = messages.get(roomId) ?? [];
      l.push(reply);
      messages.set(roomId, l);
      room.lastMessageAt = reply.createdAt;
      subscribers.get(roomId)?.forEach((h) => h(reply));
    }
    return msg;
  },

  subscribe(roomId: string, handler: (m: ChatMessage) => void): () => void {
    let set = subscribers.get(roomId);
    if (!set) {
      set = new Set();
      subscribers.set(roomId, set);
    }
    set.add(handler);
    return () => set?.delete(handler);
  },

  async setPeerStatus(roomId: string, status: ChatRoom["peerStatus"]) {
    const room = rooms.get(roomId);
    if (room) room.peerStatus = status;
  },

  async getRoom(roomId: string) {
    return rooms.get(roomId) ?? null;
  },

  async listRooms() {
    return Array.from(rooms.values());
  },
};

export function getMessagesForRoom(roomId: string): ChatMessage[] {
  return messages.get(roomId) ?? [];
}

function pickReply(_incoming: string): string {
  const replies = [
    "got it",
    "understood — line is clear",
    "sounds good. speak freely here.",
    "ack",
    "the room feels solid. carry on.",
    "right, this stays between us.",
    "noted",
  ];
  return replies[Math.floor(Math.random() * replies.length)];
}
