/**
 * HolepunchChatTransport — L2 live frames (L3 seal) + plain L1 chat.relay fallback.
 * @see docs/security/encryption.md
 * @see docs/security/p2pchatprotocol.md §16
 */

import { ConcealSmartMessageAdapter } from "@/services/conceal/ConcealSmartMessageAdapter";
import {
  __setHolepunchSidecarBackend,
  getHolepunchSidecarBackend,
  type HolepunchSidecarBackend,
} from "@/services/p2p/HolepunchSidecarClient";
import {
  HOLEPUNCH_CONNECT_TIMEOUT_MS,
  holepunchBackoffMs,
} from "@/services/p2p/holepunchPolicy";
import {
  exportKeyHex,
  importKeyHex,
  P2PEncryptionAdapter,
} from "@/services/p2p/P2PEncryptionAdapter";
import { isRoomRevoked } from "@/services/p2p/revokedRoomsStore";
import {
  listCatalogRooms,
  loadCatalogRoom,
  patchCatalogRoom,
  removeCatalogRoom,
  upsertCatalogRoom,
} from "@/services/p2p/roomCatalogStore";
import {
  loadRoomSession,
  removeRoomSession,
  saveRoomSession,
  updateRoomSessionCounters,
} from "@/services/p2p/roomSessionStore";
import {
  assertCanSendLive,
  assertCanSendMessages,
} from "@/services/protocol/composerGate";
import {
  isRelayEligibleStatus,
  isRoomExpired,
  nowUnix,
  preferredChannel,
  resolveIncomingLifecycle,
  transitionRoom,
} from "@/services/protocol/roomLifecycle";
import type { ChatMessage, ChatRoom } from "@/types/models";
import type {
  ChatContentEnvelopeV1,
  ChatRelayPayload,
  HolepunchBootstrapContract,
  P2PSessionConfig,
} from "@/types/protocol";
import { RELAY_MAX_TEXT_CHARS } from "@/types/protocol";
import type { ChatTransport, RoomBootstrap } from "@/types/services";
import { uid } from "@/utils/format";

let connectTimeoutMs = HOLEPUNCH_CONNECT_TIMEOUT_MS;

/** Test hook: shorten connect wait (e.g. solo peer → timeout). */
export function __setHolepunchConnectTimeoutMs(ms: number | null): void {
  connectTimeoutMs = ms ?? HOLEPUNCH_CONNECT_TIMEOUT_MS;
}

/** Test-only: auto-peer stubs cannot seal a reciprocal proof frame. */
let skipPostConnectProofForTests = false;
export function __setHolepunchSkipProof(skip: boolean): void {
  skipPostConnectProofForTests = skip;
}

type RoomState = {
  room: ChatRoom;
  contract?: HolepunchBootstrapContract;
  session?: P2PSessionConfig;
  peerId: string;
  topicRef?: string;
};

const rooms = new Map<string, RoomState>();
const messagesByRoom = new Map<string, ChatMessage[]>();
const subscribers = new Map<string, Set<(m: ChatMessage) => void>>();
const contractsByRoom = new Map<string, HolepunchBootstrapContract>();
/** topicRef → room ids joined on that topic */
const topicRooms = new Map<string, Set<string>>();

let backendUnsubs: Array<() => void> = [];
let backendWired = false;
let lastSidecarDetail: string | undefined;

/** Per-room single-flight guard: concurrent connect/restore share one attempt. */
const inFlightConnects = new Map<string, Promise<ChatRoom>>();
/** Earliest time an *automatic* retry (poll-driven restore) may start a new attempt. */
const nextAutoRetryAt = new Map<string, number>();

/**
 * Run `run` as the sole active connection attempt for `roomId`. A concurrent
 * caller receives the same in-flight promise instead of starting a new swarm
 * join, and the guard releases as soon as the attempt settles either way.
 */
function runConnectSingleFlight(
  roomId: string,
  run: () => Promise<ChatRoom>,
): Promise<ChatRoom> {
  const existing = inFlightConnects.get(roomId);
  if (existing) return existing;
  const attempt = run().finally(() => {
    inFlightConnects.delete(roomId);
  });
  inFlightConnects.set(roomId, attempt);
  return attempt;
}

/** Post-connect L1 proof before `connected`. @see docs/security/encryption.md */
const PROOF_TIMEOUT_MS = 5_000;
/** Rooms currently waiting for the peer's proof frame. */
const pendingProofRooms = new Set<string>();
/** Resolve callbacks for awaited proof frames. */
const proofResolvers = new Map<string, (ok: boolean) => void>();
/** Proof arrived before we entered the proof phase (rare race). */
const proofArrivedEarly = new Map<string, boolean>();

function backend(): HolepunchSidecarBackend {
  return getHolepunchSidecarBackend();
}

function wireBackendOnce(): void {
  if (backendWired) return;
  backendWired = true;
  const b = backend();
  backendUnsubs.push(
    b.onFrame(({ roomId, payload }) => {
      handleIncomingFrame(roomId, payload);
    }),
  );
  backendUnsubs.push(
    b.onPeers((topicRef, count) => {
      maybeMarkConnected(topicRef, count);
      if (count < 1) {
        maybeMarkPeerLost(topicRef);
      }
    }),
  );
  backendUnsubs.push(
    b.onConnectionStatus((status, detail) => {
      if (status === "offline") {
        lastSidecarDetail = detail ?? "Holepunch sidecar offline";
        for (const state of rooms.values()) {
          if (
            state.room.lifecycleStatus === "connected" ||
            state.room.lifecycleStatus === "connecting"
          ) {
            state.room = {
              ...state.room,
              peerStatus: "offline",
              lifecycleStatus:
                state.room.lifecycleStatus === "connected"
                  ? "connect_failed"
                  : state.room.lifecycleStatus,
              lastConnectError: "unreachable",
            };
            rooms.set(state.room.id, state);
          }
        }
      } else {
        lastSidecarDetail = undefined;
      }
    }),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Seal and send a proof envelope; AEAD open on the remote proves L1 keys.
 * "proof" opens the handshake; "proof-ack" answers a peer's request.
 */
async function sendProofFrame(
  state: RoomState,
  kind: "proof" | "proof-ack" = "proof",
): Promise<void> {
  if (!state.session || !state.topicRef) {
    throw new Error("sendProofFrame: missing session or topicRef");
  }
  const envelope = {
    schemaVersion: 1 as const,
    messageId: `proof-${state.room.id}-${state.session.sendCounter}`,
    clientId: "system",
    sentAt: new Date().toISOString(),
    kind: "proof" as const,
    text: `${kind}:v1:${state.session.sessionId}`,
  };
  const plaintext = new TextEncoder().encode(JSON.stringify(envelope));
  const aad = new TextEncoder().encode(
    `v1|${state.room.id}|${state.session.sessionId}`,
  );
  const sealed = await P2PEncryptionAdapter.seal({
    session: state.session,
    plaintext,
    aad,
  });
  state.session = sealed.session;
  updateRoomSessionCounters(state.room.id, {
    sendCounter: sealed.session.sendCounter,
    recvCounter: sealed.session.recvCounter,
  });
  const wire = new Uint8Array(sealed.nonce.length + sealed.ciphertext.length);
  wire.set(sealed.nonce, 0);
  wire.set(sealed.ciphertext, sealed.nonce.length);
  const payload = btoa(String.fromCharCode(...wire));
  backend().sendFrame(state.topicRef, state.room.id, payload);
  rooms.set(state.room.id, state);
}

/**
 * Send our proof; wait up to PROOF_TIMEOUT_MS for the peer's proof or ack.
 * timeout = peer silent (retryable); mismatch = AEAD failure (rekey needed).
 */
async function waitForProof(
  state: RoomState,
): Promise<"ok" | "timeout" | "mismatch"> {
  pendingProofRooms.add(state.room.id);
  try {
    await sendProofFrame(state, "proof");
  } catch {
    return "mismatch";
  }
  if (proofArrivedEarly.has(state.room.id)) {
    return "ok";
  }
  const proofPromise = new Promise<boolean>((resolve) => {
    proofResolvers.set(state.room.id, resolve);
  });
  const TIMED_OUT = Symbol();
  const result = await Promise.race([
    proofPromise,
    sleep(PROOF_TIMEOUT_MS).then(() => TIMED_OUT),
  ]);
  proofResolvers.delete(state.room.id);
  if (result === TIMED_OUT) return "timeout";
  return result === true ? "ok" : "mismatch";
}

function notify(roomId: string, msg: ChatMessage): void {
  const list = messagesByRoom.get(roomId) ?? [];
  const idx = list.findIndex((m) => m.id === msg.id);
  if (idx >= 0) list[idx] = msg;
  else list.push(msg);
  messagesByRoom.set(roomId, list);
  for (const h of subscribers.get(roomId) ?? []) h(msg);
}

/** Stable id for L1 relay rows (dedupe on rescan). */
export function relayMessageId(
  roomId: string,
  sentAt: number,
  text: string,
): string {
  return `r:${roomId}:${sentAt}:${text}`;
}

/** Resolve room for L1 relay without requiring session keys. */
function ensureRoomForRelay(roomId: string): RoomState | null {
  const live = rooms.get(roomId);
  if (live) {
    if (live.room.roomTtl && isRoomExpired(live.room.roomTtl)) return null;
    if (live.room.lifecycleStatus === "pending") return null;
    return live;
  }
  const catalog = loadCatalogRoom(roomId);
  if (!catalog) return null;
  if (catalog.roomTtl && isRoomExpired(catalog.roomTtl)) return null;
  if (catalog.lifecycleStatus === "pending") return null;
  return ensureRoom(catalog.contactId, {
    roomId: catalog.id,
    roomKeyRef: catalog.roomKeyRef,
    bootstrapSource: catalog.bootstrapSource,
    lifecycleStatus: catalog.lifecycleStatus,
    inviteId: catalog.inviteId,
    inviteExpiry: catalog.inviteExpiry,
    roomTtl: catalog.roomTtl,
    roomTopic: catalog.roomTopic,
  });
}

/**
 * Append inbound L1 relay text when room exists, post-pending, not expired.
 * @see docs/security/p2pchatprotocol.md §16
 */
export async function ingestChatRelay(
  relay: ChatRelayPayload,
): Promise<ChatMessage | null> {
  const state = ensureRoomForRelay(relay.roomId);
  if (!state) return null;
  const id = relayMessageId(relay.roomId, relay.sentAt, relay.text);
  const existing = messagesByRoom.get(relay.roomId) ?? [];
  if (existing.some((m) => m.id === id)) return null;

  const msg: ChatMessage = {
    id,
    roomId: relay.roomId,
    direction: "in",
    text: relay.text,
    createdAt: new Date(relay.sentAt * 1000).toISOString(),
    status: "delivered",
    channel: "relay",
    kind: "text",
  };
  notify(relay.roomId, msg);
  state.room = { ...state.room, lastMessageAt: msg.createdAt };
  rooms.set(relay.roomId, state);
  return msg;
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

/** Restore crypto session + rejoin swarm after reload. */
export async function restoreRoomSession(
  roomId: string,
): Promise<ChatRoom | null> {
  if (isRoomRevoked(roomId)) {
    removeRoomSession(roomId);
    removeCatalogRoom(roomId);
    rooms.delete(roomId);
    return null;
  }
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

function maybeMarkConnected(topicRef: string, peerCount: number): void {
  if (peerCount < 1) return;
  for (const roomId of topicRooms.get(topicRef) ?? []) {
    const state = rooms.get(roomId);
    if (!state) continue;
    // Only re-mark a room that was already cryptographically connected and the
    // peer briefly dropped (connecting). connect_failed means proof never ran
    // (or failed) — do NOT skip the proof; let the reconnect interval handle it.
    if (
      state.room.lifecycleStatus === "connecting" ||
      state.room.lifecycleStatus === "connected"
    ) {
      state.room = {
        ...state.room,
        lifecycleStatus: "connected",
        peerStatus: "online",
        lastConnectError: undefined,
      };
      rooms.set(roomId, state);
      persistLiveSession(state);
    }
  }
}

function maybeMarkPeerLost(topicRef: string): void {
  for (const roomId of topicRooms.get(topicRef) ?? []) {
    const state = rooms.get(roomId);
    if (!state) continue;
    if (state.room.lifecycleStatus !== "connected") continue;
    state.room = {
      ...state.room,
      peerStatus: "connecting",
      lifecycleStatus: "connecting",
    };
    rooms.set(roomId, state);
  }
}

function handleIncomingFrame(roomId: string, payloadB64: string): void {
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
      if (!opened) {
        if (pendingProofRooms.has(roomId)) {
          const resolver = proofResolvers.get(roomId);
          if (resolver) {
            proofResolvers.delete(roomId);
            resolver(false);
          }
        }
        return;
      }
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

      if (envelope?.kind === "proof") {
        const text = typeof envelope.text === "string" ? envelope.text : "";
        const isRequest = text.startsWith("proof:v1:");
        const proofOk = isRequest || text.startsWith("proof-ack:v1:");
        const resolver = proofResolvers.get(roomId);
        if (resolver) {
          proofResolvers.delete(roomId);
          resolver(proofOk);
        } else if (proofOk) {
          proofArrivedEarly.set(roomId, true);
        }
        // Idle side answers a reconnecting peer's request; acks never re-ack,
        // so this cannot ping-pong.
        if (isRequest && !resolver) {
          void sendProofFrame(state, "proof-ack").catch(() => {});
        }
        return;
      }

      const msgKind = (envelope?.kind ??
        "text") as import("@/types/models").ChatMessageKind;
      const msg: ChatMessage = {
        id: envelope?.messageId ?? uid("m"),
        roomId,
        direction: "in",
        text: msgKind === "delete" ? "" : (envelope?.text ?? text),
        createdAt: envelope?.sentAt ?? new Date().toISOString(),
        status: "delivered",
        channel: "live",
        clientId: envelope?.clientId,
        kind: msgKind,
        targetMessageId: envelope?.targetMessageId,
        reaction: envelope?.reaction,
        deletedAt: msgKind === "delete" ? new Date().toISOString() : undefined,
        editedAt: msgKind === "edit" ? new Date().toISOString() : undefined,
      };
      notify(roomId, msg);
    });
  } catch {
    /* fail closed */
  }
}

async function attemptConnect(state: RoomState): Promise<ChatRoom> {
  wireBackendOnce();
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
  state.topicRef = topicRef;
  const roomSet = topicRooms.get(topicRef) ?? new Set();
  roomSet.add(state.room.id);
  topicRooms.set(topicRef, roomSet);

  try {
    await backend().ensureConnected();
    await backend().join(topicRef, state.room.id);
  } catch {
    state.room = {
      ...state.room,
      lifecycleStatus: "connect_failed",
      peerStatus: "offline",
      lastConnectError: "unreachable",
    };
    rooms.set(state.room.id, state);
    patchCatalogRoom(state.room.id, {
      lifecycleStatus: "connect_failed",
      lastConnectError: "unreachable",
    });
    scheduleAutoRetryBackoff(state);
    return state.room;
  }

  const deadline = Date.now() + connectTimeoutMs;
  while (Date.now() < deadline) {
    const count = backend().getPeerCount(topicRef);
    if (count >= 1) {
      const proofResult = skipPostConnectProofForTests
        ? ("ok" as const)
        : await waitForProof(state);
      pendingProofRooms.delete(state.room.id);
      proofArrivedEarly.delete(state.room.id);

      if (proofResult !== "ok") {
        // timeout = peer silent → retryable, keep session.
        // mismatch = AEAD open failed → wipe so a fresh derive can rekey.
        const code = proofResult === "timeout" ? "timeout" : "crypto_mismatch";
        state.room = {
          ...state.room,
          lifecycleStatus: "connect_failed",
          peerStatus: "offline",
          lastConnectError: code,
        };
        rooms.set(state.room.id, state);
        patchCatalogRoom(state.room.id, {
          lifecycleStatus: "connect_failed",
          lastConnectError: code,
        });
        scheduleAutoRetryBackoff(state);
        if (code === "crypto_mismatch") {
          removeRoomSession(state.room.id);
        }
        return state.room;
      }

      state.room = {
        ...state.room,
        lifecycleStatus: "connected",
        peerStatus: "online",
        lastConnectError: undefined,
      };
      rooms.set(state.room.id, state);
      patchCatalogRoom(state.room.id, {
        lifecycleStatus: "connected",
        lastConnectError: undefined,
      });
      nextAutoRetryAt.delete(state.room.id);
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
  patchCatalogRoom(state.room.id, {
    lifecycleStatus: "connect_failed",
    lastConnectError: "timeout",
  });
  scheduleAutoRetryBackoff(state);
  return state.room;
}

/** Schedule the earliest time a poll-driven (automatic) retry may reattempt. */
function scheduleAutoRetryBackoff(state: RoomState): void {
  nextAutoRetryAt.set(
    state.room.id,
    Date.now() + holepunchBackoffMs(state.room.connectAttempts ?? 1),
  );
}

function ensureRoom(contactId: string, bootstrap?: RoomBootstrap): RoomState {
  const id = bootstrap?.roomId ?? uid("room");
  if (isRoomRevoked(id)) {
    // Leave forever: wipe any in-memory residue — never return / re-upsert.
    rooms.delete(id);
    messagesByRoom.delete(id);
    subscribers.delete(id);
    contractsByRoom.delete(id);
    removeCatalogRoom(id);
    removeRoomSession(id);
    throw new Error("Room revoked.");
  }
  const existing = rooms.get(id);
  if (existing) {
    if (
      bootstrap?.lifecycleStatus &&
      bootstrap.lifecycleStatus !== existing.room.lifecycleStatus
    ) {
      existing.room = {
        ...existing.room,
        // Monotonic: a stale `pending` hydration must never regress a room
        // that already moved past acceptance. @see docs/security/p2pchatprotocol.md §9
        lifecycleStatus: resolveIncomingLifecycle(
          existing.room.lifecycleStatus,
          bootstrap.lifecycleStatus,
        ),
        roomTopic: bootstrap.roomTopic ?? existing.room.roomTopic,
        inviteId: bootstrap.inviteId ?? existing.room.inviteId,
        inviteExpiry: bootstrap.inviteExpiry ?? existing.room.inviteExpiry,
        roomTtl: bootstrap.roomTtl ?? existing.room.roomTtl,
        roomKeyRef: bootstrap.roomKeyRef ?? existing.room.roomKeyRef,
      };
      upsertCatalogRoom(existing.room);
    }
    return existing;
  }
  const catalog = loadCatalogRoom(id);
  const baseLifecycle = catalog?.lifecycleStatus ?? "pending";
  const room: ChatRoom = {
    id,
    contactId: contactId || catalog?.contactId || "",
    bootstrapSource:
      bootstrap?.bootstrapSource ??
      catalog?.bootstrapSource ??
      "conceal-smart-message",
    roomKeyRef: bootstrap?.roomKeyRef ?? catalog?.roomKeyRef ?? `key:${id}`,
    peerStatus: "offline",
    lifecycleStatus: bootstrap?.lifecycleStatus
      ? resolveIncomingLifecycle(baseLifecycle, bootstrap.lifecycleStatus)
      : baseLifecycle,
    roomTopic: bootstrap?.roomTopic ?? catalog?.roomTopic,
    inviteId: bootstrap?.inviteId ?? catalog?.inviteId,
    inviteExpiry: bootstrap?.inviteExpiry ?? catalog?.inviteExpiry,
    roomTtl: bootstrap?.roomTtl ?? catalog?.roomTtl,
    connectAttempts: 0,
    lastConnectError: catalog?.lastConnectError,
    createdAt: catalog?.createdAt ?? new Date().toISOString(),
    lastMessageAt: catalog?.lastMessageAt,
  };
  const state: RoomState = { room, peerId: uid("peer") };
  rooms.set(id, state);
  messagesByRoom.set(id, []);
  upsertCatalogRoom(room);
  return state;
}

async function sendRelayText(
  state: RoomState,
  text: string,
): Promise<ChatMessage> {
  if (!isRelayEligibleStatus(state.room.lifecycleStatus)) {
    throw new Error("Relay only after invite accepted.");
  }
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Empty message.");
  if (trimmed.length > RELAY_MAX_TEXT_CHARS) {
    throw new Error(
      `Relay messages are limited to ${RELAY_MAX_TEXT_CHARS} characters.`,
    );
  }
  if (/[,{}]/.test(trimmed)) {
    throw new Error("Relay text cannot contain , { or }.");
  }
  const sentAt = nowUnix();
  const roomId = state.room.id;
  const id = relayMessageId(roomId, sentAt, trimmed);
  const pending: ChatMessage = {
    id,
    roomId,
    direction: "out",
    text: trimmed,
    createdAt: new Date(sentAt * 1000).toISOString(),
    status: "sending",
    channel: "relay",
    kind: "text",
  };
  notify(roomId, pending);
  try {
    await ConcealSmartMessageAdapter.sendChatRelay({
      contactId: state.room.contactId,
      relay: {
        type: "chat.relay",
        roomId,
        sentAt,
        text: trimmed,
      },
    });
    const msg: ChatMessage = { ...pending, status: "delivered" };
    notify(roomId, msg);
    state.room = { ...state.room, lastMessageAt: msg.createdAt };
    rooms.set(roomId, state);
    return msg;
  } catch (e) {
    notify(roomId, { ...pending, status: "failed" });
    throw e instanceof Error ? e : new Error("Relay broadcast failed");
  }
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
    return runConnectSingleFlight(contract.roomId, async () => {
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
      upsertCatalogRoom(state.room);
      // A poll-driven automatic reconnect must still honor backoff between
      // settled attempts; only a settled connect_failed room can be gated.
      const retryAt = nextAutoRetryAt.get(contract.roomId);
      if (
        state.room.lifecycleStatus === "connect_failed" &&
        retryAt &&
        retryAt > Date.now()
      ) {
        return state.room;
      }
      return attemptConnect(state);
    });
  },

  async leaveRoom(roomId) {
    const state = rooms.get(roomId);
    if (!state) {
      // Still honor leave-forever when only the durable catalog remains.
      removeCatalogRoom(roomId);
      removeRoomSession(roomId);
      return;
    }
    const proofResolver = proofResolvers.get(roomId);
    if (proofResolver) {
      proofResolvers.delete(roomId);
      proofResolver(false);
    }
    pendingProofRooms.delete(roomId);
    proofArrivedEarly.delete(roomId);

    const topicRef = state.topicRef ?? state.contract?.transport.topicRef;
    if (topicRef) {
      try {
        await backend().leave(topicRef, roomId);
      } catch {
        /* ignore */
      }
      const set = topicRooms.get(topicRef);
      set?.delete(roomId);
      if (set && set.size === 0) topicRooms.delete(topicRef);
    }
    // leaveRoom = leave forever (product rule). Temporary offline never calls this.
    rooms.delete(roomId);
    messagesByRoom.delete(roomId);
    subscribers.delete(roomId);
    contractsByRoom.delete(roomId);
    nextAutoRetryAt.delete(roomId);
    removeRoomSession(roomId);
    removeCatalogRoom(roomId);
  },

  /** Leave swarm for all rooms; keep catalog, sessions, and in-memory rooms. */
  async softLeaveAll() {
    const joined = [...topicRooms.entries()].flatMap(([topicRef, roomIds]) =>
      [...roomIds].map((roomId) => ({ topicRef, roomId })),
    );
    for (const { topicRef, roomId } of joined) {
      try {
        await backend().leave(topicRef, roomId);
      } catch {
        /* ignore */
      }
      const state = rooms.get(roomId);
      if (state) {
        state.topicRef = undefined;
        if (
          state.room.lifecycleStatus === "connected" ||
          state.room.lifecycleStatus === "connecting"
        ) {
          state.room = {
            ...state.room,
            peerStatus: "offline",
            lifecycleStatus: "accepted",
          };
        }
        rooms.set(roomId, state);
      }
    }
    topicRooms.clear();
  },

  async retryConnect(roomId) {
    const state = rooms.get(roomId);
    if (!state?.contract) throw new Error("Nothing to retry.");
    return runConnectSingleFlight(roomId, async () => {
      const attempt = state.room.connectAttempts ?? 1;
      await sleep(holepunchBackoffMs(attempt));
      return attemptConnect(state);
    });
  },

  async sendMessage(roomId, text) {
    const state = rooms.get(roomId) ?? ensureRoomForRelay(roomId);
    if (!state) throw new Error("Room not found.");
    assertCanSendMessages(state.room.lifecycleStatus);
    if (state.room.roomTtl && isRoomExpired(state.room.roomTtl, nowUnix())) {
      state.room.lifecycleStatus = "expired";
      throw new Error("Room expired.");
    }

    const channel = preferredChannel(state.room.lifecycleStatus);
    if (channel === "relay") {
      return sendRelayText(state, text);
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

    const topicRef = state.contract?.transport.topicRef ?? state.topicRef;
    if (topicRef) {
      try {
        backend().sendFrame(topicRef, roomId, payload);
      } catch (e) {
        throw new Error(
          e instanceof Error ? e.message : "Holepunch sidecar offline",
        );
      }
    }

    const outKind = envelope.kind as import("@/types/models").ChatMessageKind;
    const msg: ChatMessage = {
      id: envelope.messageId,
      roomId,
      direction: "out",
      text: outKind === "delete" ? "" : (envelope.text ?? ""),
      createdAt: envelope.sentAt,
      status: "delivered",
      channel: "live",
      clientId: envelope.clientId,
      kind: outKind,
      targetMessageId: envelope.targetMessageId,
      reaction: envelope.reaction,
      deletedAt: outKind === "delete" ? envelope.sentAt : undefined,
      editedAt: outKind === "edit" ? envelope.sentAt : undefined,
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
    if (isRoomRevoked(roomId)) {
      removeCatalogRoom(roomId);
      rooms.delete(roomId);
      return null;
    }
    const live = rooms.get(roomId)?.room;
    if (live) return live;
    const catalog = loadCatalogRoom(roomId);
    if (!catalog) return null;
    return ensureRoom(catalog.contactId, {
      roomId: catalog.id,
      roomKeyRef: catalog.roomKeyRef,
      bootstrapSource: catalog.bootstrapSource,
      lifecycleStatus: catalog.lifecycleStatus,
      inviteId: catalog.inviteId,
      inviteExpiry: catalog.inviteExpiry,
      roomTtl: catalog.roomTtl,
      roomTopic: catalog.roomTopic,
    }).room;
  },

  async listRooms() {
    // Durable catalog survives restart; only inviteExpiry / roomTtl prune entries.
    const catalog = listCatalogRooms();
    const catalogIds = new Set(catalog.map((r) => r.id));
    for (const entry of catalog) {
      if (isRoomRevoked(entry.id)) {
        removeCatalogRoom(entry.id);
        rooms.delete(entry.id);
        catalogIds.delete(entry.id);
        continue;
      }
      if (!rooms.has(entry.id)) {
        ensureRoom(entry.contactId, {
          roomId: entry.id,
          roomKeyRef: entry.roomKeyRef,
          bootstrapSource: entry.bootstrapSource,
          lifecycleStatus: entry.lifecycleStatus,
          inviteId: entry.inviteId,
          inviteExpiry: entry.inviteExpiry,
          roomTtl: entry.roomTtl,
          roomTopic: entry.roomTopic,
        });
      }
    }
    for (const id of [...rooms.keys()]) {
      if (!catalogIds.has(id)) {
        rooms.delete(id);
        messagesByRoom.delete(id);
      }
    }
    return [...rooms.values()].map((s) => s.room);
  },
};

export function getMessagesForRoom(roomId: string): ChatMessage[] {
  return [...(messagesByRoom.get(roomId) ?? [])];
}

export function getLastSidecarDetail(): string | undefined {
  return lastSidecarDetail;
}

/**
 * Discovery topic this room joins — both peers must show the same value, or
 * they announce on unmeetable topics while agreeing on the roomId.
 * @see docs/architecture/pairing-and-topics.md
 */
export function getTopicRefForRoom(roomId: string): string | undefined {
  const state = rooms.get(roomId);
  return (
    state?.topicRef ??
    state?.contract?.transport.topicRef ??
    contractsByRoom.get(roomId)?.transport.topicRef
  );
}

export function __resetHolepunchTransport(): void {
  for (const u of backendUnsubs) u();
  backendUnsubs = [];
  backendWired = false;
  lastSidecarDetail = undefined;
  connectTimeoutMs = HOLEPUNCH_CONNECT_TIMEOUT_MS;
  skipPostConnectProofForTests = false;
  rooms.clear();
  messagesByRoom.clear();
  subscribers.clear();
  topicRooms.clear();
  contractsByRoom.clear();
  inFlightConnects.clear();
  nextAutoRetryAt.clear();
  __setHolepunchSidecarBackend(null);
}

/** @deprecated use __setHolepunchSidecarBackend from HolepunchSidecarClient */
export { __setHolepunchSidecarBackend };
