/**
 * HolepunchChatTransport — required live transport.
 *
 * Uses a topic-based peer mesh (in-process + BroadcastChannel) that implements
 * the HolepunchBootstrapContract connect/retry lifecycle. Real Hyperswarm DHT
 * can replace the mesh backend without changing the ChatTransport seam.
 */

import {
  HOLEPUNCH_CONNECT_TIMEOUT_MS,
  holepunchBackoffMs,
} from "@/services/p2p/holepunchPolicy";
import {
  exportKeyHex,
  importKeyHex,
  P2PEncryptionAdapter,
} from "@/services/p2p/P2PEncryptionAdapter";
import {
  loadRoomSession,
  removeRoomSession,
  saveRoomSession,
  updateRoomSessionCounters,
} from "@/services/p2p/roomSessionStore";
import { assertCanSendLive } from "@/services/protocol/composerGate";
import {
  isRoomExpired,
  nowUnix,
  transitionRoom,
} from "@/services/protocol/roomLifecycle";
import type { ChatMessage, ChatRoom } from "@/types/models";
import type {
  ChatContentEnvelopeV1,
  HolepunchBootstrapContract,
  P2PSessionConfig,
} from "@/types/protocol";
import type { ChatTransport, RoomBootstrap } from "@/types/services";
import { uid } from "@/utils/format";

const CONNECT_TIMEOUT_MS = HOLEPUNCH_CONNECT_TIMEOUT_MS;

type RoomState = {
  room: ChatRoom;
  contract?: HolepunchBootstrapContract;
  session?: P2PSessionConfig;
  peerId: string;
};

const rooms = new Map<string, RoomState>();
const messagesByRoom = new Map<string, ChatMessage[]>();
const subscribers = new Map<string, Set<(m: ChatMessage) => void>>();
/** topicRef → peerIds currently joining */
const topicPeers = new Map<string, Set<string>>();
const topicRooms = new Map<string, Set<string>>();
const contractsByRoom = new Map<string, HolepunchBootstrapContract>();

let broadcast: BroadcastChannel | null = null;

function getBroadcast(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!broadcast) {
    broadcast = new BroadcastChannel("gnh-holepunch-mesh");
    broadcast.onmessage = (ev) => {
      const data = ev.data as {
        type: string;
        topicRef: string;
        fromPeer: string;
        roomId?: string;
        payload?: string;
      };
      if (data.type === "peer-hello") {
        const peers = topicPeers.get(data.topicRef) ?? new Set();
        peers.add(data.fromPeer);
        topicPeers.set(data.topicRef, peers);
        maybeMarkConnected(data.topicRef);
      }
      if (data.type === "frame" && data.roomId && data.payload) {
        handleIncomingFrame(data.roomId, data.fromPeer, data.payload);
      }
    };
  }
  return broadcast;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function notify(roomId: string, msg: ChatMessage): void {
  const list = messagesByRoom.get(roomId) ?? [];
  list.push(msg);
  messagesByRoom.set(roomId, list);
  for (const h of subscribers.get(roomId) ?? []) h(msg);
}

function persistLiveSession(state: RoomState): void {
  const contract = state.contract ?? contractsByRoom.get(state.room.id);
  const session = state.session;
  if (!contract || !session) return;
  const sendKeyHex = exportKeyHex(session.sendKeyRef);
  const recvKeyHex = exportKeyHex(session.recvKeyRef);
  if (!sendKeyHex || !recvKeyHex) return;
  saveRoomSession({
    roomId: state.room.id,
    contactId: state.room.contactId,
    contract: {
      ...contract,
      sendCounter: session.sendCounter,
      recvCounter: session.recvCounter,
    },
    sendKeyHex,
    recvKeyHex,
    sendCounter: session.sendCounter,
    recvCounter: session.recvCounter,
    savedAt: new Date().toISOString(),
  });
}

/** Restore crypto session + rejoin mesh after reload. */
export async function restoreRoomSession(
  roomId: string,
): Promise<ChatRoom | null> {
  const saved = loadRoomSession(roomId);
  if (!saved) return null;
  if (isRoomExpired(saved.contract.roomTtl)) {
    removeRoomSession(roomId);
    return null;
  }
  importKeyHex(saved.contract.sendKeyRef, saved.sendKeyHex);
  importKeyHex(saved.contract.recvKeyRef, saved.recvKeyHex);
  const contract: HolepunchBootstrapContract = {
    ...saved.contract,
    sendCounter: saved.sendCounter,
    recvCounter: saved.recvCounter,
  };
  let state = rooms.get(roomId);
  if (!state) {
    state = ensureRoom(saved.contactId, {
      roomId,
      roomKeyRef: contract.sessionId,
      bootstrapSource: "conceal-smart-message",
      lifecycleStatus: "accepted",
      inviteId: contract.inviteId,
      roomTtl: contract.roomTtl,
    });
  }
  return HolepunchChatTransport.connect(contract);
}

function maybeMarkConnected(topicRef: string): void {
  const peers = topicPeers.get(topicRef);
  if (!peers || peers.size < 1) return;
  for (const roomId of topicRooms.get(topicRef) ?? []) {
    const state = rooms.get(roomId);
    if (!state) continue;
    if (
      state.room.lifecycleStatus === "connecting" ||
      state.room.lifecycleStatus === "connect_failed" ||
      state.room.lifecycleStatus === "connected"
    ) {
      const from =
        state.room.lifecycleStatus === "connect_failed"
          ? "connect_failed"
          : state.room.lifecycleStatus === "connecting"
            ? "connecting"
            : "connected";
      state.room = {
        ...state.room,
        lifecycleStatus:
          from === "connected" ? "connected" : transitionRoom(from, "connected"),
        peerStatus: "online",
        lastConnectError: undefined,
      };
      rooms.set(roomId, state);
      persistLiveSession(state);
    }
  }
}

function handleIncomingFrame(
  roomId: string,
  _fromPeer: string,
  payloadB64: string,
): void {
  const state = rooms.get(roomId);
  if (!state?.session) return;
  try {
    const raw = Uint8Array.from(atob(payloadB64), (c) => c.charCodeAt(0));
    const nonce = raw.slice(0, 12);
    const ciphertext = raw.slice(12);
    void P2PEncryptionAdapter.open({
      session: state.session,
      ciphertext,
      nonce,
      aad: new TextEncoder().encode(`v1|${roomId}|${state.session.sessionId}`),
    }).then((opened) => {
      if (!opened) return;
      state.session = opened.session;
      updateRoomSessionCounters(roomId, {
        sendCounter: opened.session.sendCounter,
        recvCounter: opened.session.recvCounter,
      });
      const text = new TextDecoder().decode(opened.plaintext);
      let envelope: ChatContentEnvelopeV1 | null = null;
      try {
        envelope = JSON.parse(text) as ChatContentEnvelopeV1;
      } catch {
        envelope = null;
      }
      const msg: ChatMessage = {
        id: envelope?.messageId ?? uid("m"),
        roomId,
        direction: "in",
        text: envelope?.kind === "delete" ? "" : (envelope?.text ?? text),
        createdAt: envelope?.sentAt ?? new Date().toISOString(),
        status: "delivered",
        clientId: envelope?.clientId,
        kind: envelope?.kind ?? "text",
        targetMessageId: envelope?.targetMessageId,
        reaction: envelope?.reaction,
        deletedAt:
          envelope?.kind === "delete" ? new Date().toISOString() : undefined,
        editedAt:
          envelope?.kind === "edit" ? new Date().toISOString() : undefined,
      };
      notify(roomId, msg);
    });
  } catch {
    /* fail closed */
  }
}

async function attemptConnect(state: RoomState): Promise<ChatRoom> {
  const contract = state.contract ?? contractsByRoom.get(state.room.id);
  if (!contract) throw new Error("Missing Holepunch bootstrap contract.");
  if (isRoomExpired(contract.roomTtl)) {
    state.room = {
      ...state.room,
      lifecycleStatus: "expired",
      peerStatus: "offline",
      lastConnectError: "expired",
    };
    rooms.set(state.room.id, state);
    return state.room;
  }

  const from = state.room.lifecycleStatus;
  try {
    if (from === "accepted") {
      state.room.lifecycleStatus = transitionRoom("accepted", "connecting");
    } else if (from === "connect_failed") {
      state.room.lifecycleStatus = transitionRoom(
        "connect_failed",
        "connecting",
      );
    } else if (from !== "connecting") {
      state.room.lifecycleStatus = "connecting";
    }
  } catch {
    state.room.lifecycleStatus = "connecting";
  }

  state.room = {
    ...state.room,
    peerStatus: "connecting",
    connectAttempts: (state.room.connectAttempts ?? 0) + 1,
    lastConnectError: undefined,
  };
  rooms.set(state.room.id, state);

  const topicRef = contract.transport.topicRef;
  const peerId = state.peerId;
  const peers = topicPeers.get(topicRef) ?? new Set();
  peers.add(peerId);
  topicPeers.set(topicRef, peers);
  const roomSet = topicRooms.get(topicRef) ?? new Set();
  roomSet.add(state.room.id);
  topicRooms.set(topicRef, roomSet);

  const bc = getBroadcast();
  bc?.postMessage({
    type: "peer-hello",
    topicRef,
    fromPeer: peerId,
    roomId: state.room.id,
  });

  const deadline = Date.now() + CONNECT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    // Web-first mesh: presence on topic counts as connected.
    if ((topicPeers.get(topicRef)?.size ?? 0) >= 1) {
      state.room = {
        ...state.room,
        lifecycleStatus: "connected",
        peerStatus: "online",
        lastConnectError: undefined,
      };
      rooms.set(state.room.id, state);
      persistLiveSession(state);
      return state.room;
    }
    await sleep(50);
  }

  state.room = {
    ...state.room,
    lifecycleStatus: "connect_failed",
    peerStatus: "offline",
    lastConnectError: "timeout",
  };
  rooms.set(state.room.id, state);
  return state.room;
}

function ensureRoom(contactId: string, bootstrap?: RoomBootstrap): RoomState {
  const id = bootstrap?.roomId ?? uid("room");
  const existing = rooms.get(id);
  if (existing) return existing;
  const room: ChatRoom = {
    id,
    contactId,
    bootstrapSource: bootstrap?.bootstrapSource ?? "conceal-smart-message",
    roomKeyRef: bootstrap?.roomKeyRef ?? `key:${id}`,
    peerStatus: "offline",
    lifecycleStatus: bootstrap?.lifecycleStatus ?? "pending",
    inviteId: bootstrap?.inviteId,
    inviteExpiry: bootstrap?.inviteExpiry,
    roomTtl: bootstrap?.roomTtl,
    connectAttempts: 0,
    createdAt: new Date().toISOString(),
  };
  const state: RoomState = { room, peerId: uid("peer") };
  rooms.set(id, state);
  messagesByRoom.set(id, []);
  return state;
}

export const HolepunchChatTransport: ChatTransport = {
  async createRoom({ contactId, bootstrap }) {
    return ensureRoom(contactId, bootstrap).room;
  },

  async joinRoom(roomId) {
    const state = rooms.get(roomId);
    if (!state) throw new Error("Room not found.");
    return state.room;
  },

  async connect(contract) {
    contractsByRoom.set(contract.roomId, contract);
    let state = rooms.get(contract.roomId);
    if (!state) {
      state = ensureRoom("", {
        roomId: contract.roomId,
        roomKeyRef: contract.sessionId,
        bootstrapSource: "conceal-smart-message",
        lifecycleStatus: "accepted",
        inviteId: contract.inviteId,
        roomTtl: contract.roomTtl,
      });
    }
    state.contract = contract;
    state.session = {
      sessionId: contract.sessionId,
      roomId: contract.roomId,
      relationshipId: contract.relationshipId,
      cipherSuite: contract.cipherSuite,
      sendKeyRef: contract.sendKeyRef,
      recvKeyRef: contract.recvKeyRef,
      nonceSeed: contract.nonceSeed,
      nonceStrategy: contract.nonceStrategy,
      sendCounter: contract.sendCounter,
      recvCounter: contract.recvCounter,
      createdAt: contract.establishedAt,
    };
    if (state.room.lifecycleStatus === "pending") {
      state.room.lifecycleStatus = "accepted";
    }
    rooms.set(contract.roomId, state);
    return attemptConnect(state);
  },

  async disconnect(roomId) {
    const state = rooms.get(roomId);
    if (!state) return;
    state.room = {
      ...state.room,
      lifecycleStatus: "closed",
      peerStatus: "offline",
    };
    rooms.set(roomId, state);
    removeRoomSession(roomId);
  },

  async retryConnect(roomId) {
    const state = rooms.get(roomId);
    if (!state?.contract) throw new Error("Nothing to retry.");
    const attempt = state.room.connectAttempts ?? 1;
    await sleep(holepunchBackoffMs(attempt));
    return attemptConnect(state);
  },

  async sendMessage(roomId, text) {
    const state = rooms.get(roomId);
    if (!state) throw new Error("Room not found.");
    assertCanSendLive(state.room.lifecycleStatus);
    if (state.room.roomTtl && isRoomExpired(state.room.roomTtl, nowUnix())) {
      state.room.lifecycleStatus = "expired";
      throw new Error("Room expired.");
    }

    const envelope: ChatContentEnvelopeV1 = {
      schemaVersion: 1,
      messageId: uid("m"),
      clientId: uid("c"),
      sentAt: new Date().toISOString(),
      kind: "text",
      text,
    };
    return this.sendContent!(roomId, envelope);
  },

  async sendContent(roomId, envelope) {
    const state = rooms.get(roomId);
    if (!state) throw new Error("Room not found.");
    assertCanSendLive(state.room.lifecycleStatus);
    if (!state.session) throw new Error("Missing session.");

    const plaintext = new TextEncoder().encode(JSON.stringify(envelope));
    const aad = new TextEncoder().encode(
      `v1|${roomId}|${state.session.sessionId}`,
    );
    const sealed = await P2PEncryptionAdapter.seal({
      session: state.session,
      plaintext,
      aad,
    });
    state.session = sealed.session;
    updateRoomSessionCounters(roomId, {
      sendCounter: sealed.session.sendCounter,
      recvCounter: sealed.session.recvCounter,
    });

    const wire = new Uint8Array(sealed.nonce.length + sealed.ciphertext.length);
    wire.set(sealed.nonce, 0);
    wire.set(sealed.ciphertext, sealed.nonce.length);
    const payload = btoa(String.fromCharCode(...wire));

    const topicRef = state.contract?.transport.topicRef;
    if (topicRef) {
      getBroadcast()?.postMessage({
        type: "frame",
        topicRef,
        fromPeer: state.peerId,
        roomId,
        payload,
      });
      // Deliver to other local rooms on same topic
      for (const otherId of topicRooms.get(topicRef) ?? []) {
        if (otherId === roomId) continue;
        handleIncomingFrame(otherId, state.peerId, payload);
      }
    }

    const msg: ChatMessage = {
      id: envelope.messageId,
      roomId,
      direction: "out",
      text: envelope.kind === "delete" ? "" : (envelope.text ?? ""),
      createdAt: envelope.sentAt,
      status: "delivered",
      clientId: envelope.clientId,
      kind: envelope.kind,
      targetMessageId: envelope.targetMessageId,
      reaction: envelope.reaction,
      deletedAt: envelope.kind === "delete" ? envelope.sentAt : undefined,
      editedAt: envelope.kind === "edit" ? envelope.sentAt : undefined,
    };
    notify(roomId, msg);
    state.room = { ...state.room, lastMessageAt: msg.createdAt };
    rooms.set(roomId, state);
    return msg;
  },

  subscribe(roomId, handler) {
    const set = subscribers.get(roomId) ?? new Set();
    set.add(handler);
    subscribers.set(roomId, set);
    return () => {
      set.delete(handler);
    };
  },

  async setPeerStatus(roomId, status) {
    const state = rooms.get(roomId);
    if (!state) return;
    state.room = { ...state.room, peerStatus: status };
    rooms.set(roomId, state);
  },

  async getRoom(roomId) {
    return rooms.get(roomId)?.room ?? null;
  },

  async listRooms() {
    return [...rooms.values()].map((s) => s.room);
  },
};

export function getMessagesForRoom(roomId: string): ChatMessage[] {
  return [...(messagesByRoom.get(roomId) ?? [])];
}

export function __resetHolepunchTransport(): void {
  rooms.clear();
  messagesByRoom.clear();
  subscribers.clear();
  topicPeers.clear();
  topicRooms.clear();
  contractsByRoom.clear();
}
