/**
 * HolepunchChatTransport — L2 live frames (L1 session seal) + L1′ chat.relay fallback.
 * @see docs/security/encryption.md
 * @see docs/security/p2pchatprotocol.md §16
 */

import type { RawWalletV1 } from "conceal-wallet-sdk";
import { unsubscribeRoom as ntfyUnsubscribeRoom } from "@/lib/mobile/ntfyWakeBridge";
import { ConcealSmartMessageAdapter } from "@/services/conceal/ConcealSmartMessageAdapter";
import {
  readReceivedRecords,
  readSentRecords,
  type SdkMessageRecord,
  withReceivedRecords,
  withSentRecords,
} from "@/services/conceal/sync/messages-store";
import { getRuntime, persistRuntime } from "@/services/conceal/sync/runtime";
import { mergeContentMessage } from "@/services/p2p/chatMessageMerge";
import {
  readChatRooms,
  saveActiveMessages,
  tombstoneChatRoom,
} from "@/services/p2p/chatRoomsBlob";
import {
  __setHolepunchSidecarBackend,
  getHolepunchSidecarBackend,
  type HolepunchSidecarBackend,
} from "@/services/p2p/HolepunchSidecarClient";
import {
  HOLEPUNCH_CONNECT_TIMEOUT_MS,
  holepunchBackoffMs,
  L2_RECONNECT_GRACE_MS,
} from "@/services/p2p/holepunchPolicy";
import {
  exportKeyHex,
  importKeyHex,
  P2PEncryptionAdapter,
} from "@/services/p2p/P2PEncryptionAdapter";
import {
  isRoomRevoked,
  rememberRevokedRoom,
} from "@/services/p2p/revokedRoomsStore";
import {
  clearPokeIds,
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
import { bumpAndMirrorRelationshipTopicEpoch } from "@/services/p2p/topicEpochContactSync";
import { sendPoke } from "@/services/poke/pokeGatewayClient";
import {
  assertCanSendLive,
  assertCanSendMessages,
  assertRoomInteractive,
} from "@/services/protocol/composerGate";
import {
  buildChatAad,
  buildProofAad,
  incomingFrameAadCandidates,
} from "@/services/protocol/proofAad";
import {
  isRelayEligibleStatus,
  isRoomExpired,
  nowUnix,
  resolveIncomingLifecycle,
  transitionRoom,
} from "@/services/protocol/roomLifecycle";
import { parseChatSmartBody } from "@/services/protocol/SmartMessageProtocolAdapter";
import { useSettingsStore } from "@/state/settingsStore";
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

/** Test hook: shorten L2 hold before L1′ fallback. */
let l2SendHoldMs = L2_RECONNECT_GRACE_MS;
export function __setL2SendHoldMs(ms: number | null): void {
  l2SendHoldMs = ms ?? L2_RECONNECT_GRACE_MS;
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
const roomStateSubscribers = new Map<string, Set<(room: ChatRoom) => void>>();
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
/** Last live (L2) send/receive. */
const lastLiveAtMsByRoom = new Map<string, number>();
/** When L2 dropped from `connected` — grace anchor for L1′ deferral. */
const l2BlipStartedAtByRoom = new Map<string, number>();

function touchLastLiveAt(roomId: string, atMs = Date.now()): void {
  lastLiveAtMsByRoom.set(roomId, atMs);
}

function noteL2Blip(roomId: string, atMs = Date.now()): void {
  l2BlipStartedAtByRoom.set(roomId, atMs);
}

function clearL2Blip(roomId: string): void {
  l2BlipStartedAtByRoom.delete(roomId);
}

/** @see composerPreferredChannel grace window */
export function getL2BlipStartedAt(roomId: string): number | undefined {
  return l2BlipStartedAtByRoom.get(roomId);
}

export function getLastLiveAtMs(roomId: string): number | undefined {
  return lastLiveAtMsByRoom.get(roomId);
}

function emitRoom(room: ChatRoom): void {
  for (const h of roomStateSubscribers.get(room.id) ?? []) h(room);
}

/** UI sync when L2 drops/returns mid-chat (store otherwise stays stale). */
export function subscribeRoomState(
  roomId: string,
  handler: (room: ChatRoom) => void,
): () => void {
  const set = roomStateSubscribers.get(roomId) ?? new Set();
  set.add(handler);
  roomStateSubscribers.set(roomId, set);
  return () => {
    set.delete(handler);
  };
}

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
            if (state.room.lifecycleStatus === "connected") {
              noteL2Blip(state.room.id);
            }
            state.room = {
              ...state.room,
              peerStatus: "offline",
              lifecycleStatus:
                state.room.lifecycleStatus === "connected"
                  ? "connecting"
                  : state.room.lifecycleStatus,
              lastConnectError: "unreachable",
            };
            rooms.set(state.room.id, state);
            emitRoom(state.room);
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
  const aad = buildProofAad(state.room.id, state.session);
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
  const next = mergeContentMessage(list, msg);
  messagesByRoom.set(roomId, next);
  for (const h of subscribers.get(roomId) ?? []) h(msg);
  if (msg.channel === "live") scheduleLiveTranscriptFlush();
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
  opts?: { backgroundConnect?: boolean },
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
  state.contract = contract;
  contractsByRoom.set(roomId, contract);
  if (opts?.backgroundConnect) {
    void HolepunchChatTransport.connect(contract);
    return state.room;
  }
  return HolepunchChatTransport.connect(contract);
}

function maybeMarkConnected(topicRef: string, peerCount: number): void {
  if (peerCount < 1) return;
  for (const roomId of topicRooms.get(topicRef) ?? []) {
    const state = rooms.get(roomId);
    if (!state) continue;
    if (state.room.lifecycleStatus === "connected") {
      state.room = {
        ...state.room,
        peerStatus: "online",
        lastConnectError: undefined,
      };
      rooms.set(roomId, state);
      persistLiveSession(state);
      emitRoom(state.room);
      continue;
    }
    // Brief peer blip: session still valid — skip full proof round-trip.
    if (state.room.lifecycleStatus === "connecting" && state.session) {
      state.room = {
        ...state.room,
        lifecycleStatus: "connected",
        peerStatus: "online",
        lastConnectError: undefined,
      };
      rooms.set(roomId, state);
      patchCatalogRoom(state.room.id, {
        lifecycleStatus: "connected",
        lastConnectError: undefined,
      });
      clearL2Blip(roomId);
      touchLastLiveAt(roomId);
      persistLiveSession(state);
      emitRoom(state.room);
    }
  }
}

function maybeMarkPeerLost(topicRef: string): void {
  for (const roomId of topicRooms.get(topicRef) ?? []) {
    const state = rooms.get(roomId);
    if (!state) continue;
    if (state.room.lifecycleStatus !== "connected") continue;
    noteL2Blip(roomId);
    state.room = {
      ...state.room,
      peerStatus: "connecting",
      lifecycleStatus: "connecting",
    };
    rooms.set(roomId, state);
    emitRoom(state.room);
  }
}

function handleIncomingFrame(roomId: string, payloadB64: string): void {
  const state = rooms.get(roomId);
  const session = state?.session;
  if (!state || !session) return;
  void (async () => {
    try {
      const raw = Uint8Array.from(atob(payloadB64), (c) => c.charCodeAt(0));
      const nonce = raw.slice(0, 12);
      const ciphertext = raw.slice(12);
      let opened: Awaited<ReturnType<typeof P2PEncryptionAdapter.open>> = null;
      const openSession = session;
      for (const aad of incomingFrameAadCandidates(
        roomId,
        openSession,
        state.room.lifecycleStatus,
      )) {
        const result = await P2PEncryptionAdapter.open({
          session: openSession,
          ciphertext,
          nonce,
          aad,
        });
        if (result) {
          opened = result;
          break;
        }
      }
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
      touchLastLiveAt(roomId);
      if (state.room.lifecycleStatus === "connecting") {
        state.room = {
          ...state.room,
          lifecycleStatus: "connected",
          peerStatus: "online",
          lastConnectError: undefined,
        };
        rooms.set(roomId, state);
        patchCatalogRoom(roomId, {
          lifecycleStatus: "connected",
          lastConnectError: undefined,
        });
        clearL2Blip(roomId);
        emitRoom(state.room);
      }
      notify(roomId, msg);
    } catch {
      /* fail closed */
    }
  })();
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
      roomTtl: contract.roomTtl,
    };
    rooms.set(state.room.id, state);
    upsertCatalogRoom(state.room);
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
        lastPokedAt: undefined,
      };
      rooms.set(state.room.id, state);
      patchCatalogRoom(state.room.id, {
        lifecycleStatus: "connected",
        lastConnectError: undefined,
        lastPokedAt: undefined,
      });
      touchLastLiveAt(state.room.id);
      clearL2Blip(state.room.id);
      nextAutoRetryAt.delete(state.room.id);
      persistLiveSession(state);
      emitRoom(state.room);
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
    const lifecycleChanged = Boolean(
      bootstrap?.lifecycleStatus &&
        bootstrap.lifecycleStatus !== existing.room.lifecycleStatus,
    );
    const syncFlagChanged =
      bootstrap?.awaitingChainSync !== undefined &&
      bootstrap.awaitingChainSync !== existing.room.awaitingChainSync;
    const ttlFieldsChanged = Boolean(
      bootstrap &&
        ((bootstrap.roomTtl !== undefined &&
          bootstrap.roomTtl !== existing.room.roomTtl) ||
          (bootstrap.inviteExpiry !== undefined &&
            bootstrap.inviteExpiry !== existing.room.inviteExpiry) ||
          (bootstrap.inviteId !== undefined &&
            bootstrap.inviteId !== existing.room.inviteId)),
    );
    if (lifecycleChanged || syncFlagChanged || ttlFieldsChanged) {
      existing.room = {
        ...existing.room,
        ...(lifecycleChanged && bootstrap?.lifecycleStatus
          ? {
              // Monotonic: stale `pending` must never regress post-accept.
              lifecycleStatus: resolveIncomingLifecycle(
                existing.room.lifecycleStatus,
                bootstrap.lifecycleStatus,
              ),
            }
          : {}),
        roomTopic: bootstrap?.roomTopic ?? existing.room.roomTopic,
        inviteId: bootstrap?.inviteId ?? existing.room.inviteId,
        inviteExpiry: bootstrap?.inviteExpiry ?? existing.room.inviteExpiry,
        roomTtl: bootstrap?.roomTtl ?? existing.room.roomTtl,
        roomKeyRef: bootstrap?.roomKeyRef ?? existing.room.roomKeyRef,
        awaitingChainSync:
          bootstrap?.awaitingChainSync ?? existing.room.awaitingChainSync,
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
    awaitingChainSync:
      bootstrap?.awaitingChainSync ?? catalog?.awaitingChainSync,
    connectAttempts: 0,
    lastConnectError: catalog?.lastConnectError,
    createdAt: catalog?.createdAt ?? new Date().toISOString(),
    lastMessageAt: catalog?.lastMessageAt,
    partnerPokeHandle: catalog?.partnerPokeHandle,
    lastPokedAt: catalog?.lastPokedAt,
  };
  const state: RoomState = { room, peerId: uid("peer") };
  rooms.set(id, state);
  // Preserve hydrated transcripts across room-shell rebuild (iOS WKWebView restart).
  // @see docs/security/encryption.md (Room transcripts)
  if (!messagesByRoom.has(id)) {
    messagesByRoom.set(id, []);
  }
  upsertCatalogRoom(room);
  return state;
}

/**
 * Fire-and-forget peer-wake poke on the first L1′ relay after L2 was connected.
 * No-op when pushWakeEnabled is false, no handle is known, or poke was already sent.
 * @see docs/features/peer-wake-notification.md §4
 */
async function maybeSendPoke(state: RoomState): Promise<void> {
  const { privacy } = useSettingsStore.getState();
  if (!privacy.pushWakeEnabled) return;
  if (!state.room.partnerPokeHandle) return;
  if (state.room.lastPokedAt) return; // poke already sent this relay session

  const nowSec = nowUnix();
  try {
    await sendPoke(state.room.partnerPokeHandle);
  } catch {
    return; // best-effort
  }
  state.room = { ...state.room, lastPokedAt: nowSec };
  rooms.set(state.room.id, state);
  patchCatalogRoom(state.room.id, { lastPokedAt: nowSec });
}

/** Wait up to `ms` from now for L2. @see docs/security/p2pchatprotocol.md §16 */
async function waitForLiveUpTo(
  roomId: string,
  ms: number,
): Promise<"live" | "relay"> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const state = rooms.get(roomId);
    if (!state) return "relay";
    if (state.room.lifecycleStatus === "connected") return "live";
    await sleep(50);
  }
  return rooms.get(roomId)?.room.lifecycleStatus === "connected"
    ? "live"
    : "relay";
}

function dropMessage(roomId: string, id: string): void {
  const list = messagesByRoom.get(roomId) ?? [];
  messagesByRoom.set(
    roomId,
    list.filter((m) => m.id !== id),
  );
}

async function sendRelayText(
  state: RoomState,
  text: string,
  replaceId?: string,
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
  if (replaceId) dropMessage(roomId, replaceId);
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
    maybeSendPoke(state).catch(() => undefined);
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
      const existing = rooms.get(contract.roomId)?.room;
      assertRoomInteractive(
        existing?.lifecycleStatus ?? "accepted",
        existing?.awaitingChainSync,
      );
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
      if (contract.roomTtl && !state.room.roomTtl) {
        state.room = { ...state.room, roomTtl: contract.roomTtl };
      }
      const topicSuite = contract.transport.topicSuite ?? "SHA256_V1";
      const topicEpoch = contract.transport.topicEpoch ?? 0;
      state.session = {
        sessionId: contract.sessionId,
        roomId: contract.roomId,
        relationshipId: contract.relationshipId,
        cipherSuite: contract.cipherSuite,
        topicSuite,
        topicEpoch,
        topicRef: contract.transport.topicRef,
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

  async leaveRoom(roomId, opts) {
    const state = rooms.get(roomId);
    const persisted = state ? undefined : loadRoomSession(roomId);
    const topicSuite =
      state?.contract?.transport.topicSuite ??
      state?.session?.topicSuite ??
      persisted?.contract.transport.topicSuite;
    const relationshipId =
      state?.contract?.relationshipId ??
      state?.session?.relationshipId ??
      persisted?.contract.relationshipId;
    if (
      !opts?.skipEpochBump &&
      topicSuite === "HKDF_EPOCH_V1" &&
      relationshipId
    ) {
      const contactId = state?.room.contactId ?? persisted?.contactId;
      await bumpAndMirrorRelationshipTopicEpoch(relationshipId, contactId);
    }

    if (!state) {
      const topicRef = persisted?.contract.transport.topicRef;
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
      ntfyUnsubscribeRoom(roomId);
      clearPokeIds(roomId);
      removeCatalogRoom(roomId);
      removeRoomSession(roomId);
      rememberRevokedRoom(roomId);
      await persistChatRoomTombstone(roomId);
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
    ntfyUnsubscribeRoom(roomId);
    clearPokeIds(roomId);
    removeCatalogRoom(roomId);
    rememberRevokedRoom(roomId, state.room.inviteId);
    await persistChatRoomTombstone(roomId);
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
    assertRoomInteractive(
      state.room.lifecycleStatus,
      state.room.awaitingChainSync,
    );
    return runConnectSingleFlight(roomId, async () => {
      const attempt = state.room.connectAttempts ?? 1;
      await sleep(holepunchBackoffMs(attempt));
      return attemptConnect(state);
    });
  },

  async sendMessage(roomId, text) {
    const state = rooms.get(roomId) ?? ensureRoomForRelay(roomId);
    if (!state) throw new Error("Room not found.");
    assertRoomInteractive(
      state.room.lifecycleStatus,
      state.room.awaitingChainSync,
    );
    assertCanSendMessages(state.room.lifecycleStatus);
    if (state.room.roomTtl && isRoomExpired(state.room.roomTtl, nowUnix())) {
      state.room = { ...state.room, lifecycleStatus: "expired" };
      rooms.set(roomId, state);
      upsertCatalogRoom(state.room);
      throw new Error("Room expired.");
    }

    const lastLiveAtMs = lastLiveAtMsByRoom.get(roomId);
    const envelope: ChatContentEnvelopeV1 = {
      schemaVersion: 1,
      messageId: uid("m"),
      clientId: uid("c"),
      sentAt: new Date().toISOString(),
      kind: "text",
      text,
    };
    if (state.room.lifecycleStatus === "connected") {
      return this.sendContent!(roomId, envelope);
    }
    // Were live this session: show queued, try L2, then L1′ (poke only on fallback).
    if (state.session && lastLiveAtMs) {
      const queued: ChatMessage = {
        id: envelope.messageId,
        roomId,
        direction: "out",
        text,
        createdAt: envelope.sentAt,
        status: "queued",
        channel: "live",
        clientId: envelope.clientId,
        kind: "text",
      };
      notify(roomId, queued);
      if ((await waitForLiveUpTo(roomId, l2SendHoldMs)) === "live") {
        return this.sendContent!(roomId, envelope);
      }
      return sendRelayText(state, text, envelope.messageId);
    }
    return sendRelayText(state, text);
  },

  async sendContent(roomId, envelope) {
    const state = rooms.get(roomId);
    if (!state) throw new Error("Room not found.");
    assertCanSendLive(state.room.lifecycleStatus);
    if (!state.session) throw new Error("Missing session.");

    const plaintext = new TextEncoder().encode(JSON.stringify(envelope));
    const aad = buildChatAad(roomId, state.session);
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
    touchLastLiveAt(roomId);
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
    const restored = ensureRoom(catalog.contactId, {
      roomId: catalog.id,
      roomKeyRef: catalog.roomKeyRef,
      bootstrapSource: catalog.bootstrapSource,
      lifecycleStatus: catalog.lifecycleStatus,
      inviteId: catalog.inviteId,
      inviteExpiry: catalog.inviteExpiry,
      roomTtl: catalog.roomTtl,
      roomTopic: catalog.roomTopic,
      awaitingChainSync: catalog.awaitingChainSync,
    });
    // Poke fields come from catalog only; not in bootstrap union.
    if (catalog.partnerPokeHandle && !restored.room.partnerPokeHandle) {
      restored.room = {
        ...restored.room,
        partnerPokeHandle: catalog.partnerPokeHandle,
        lastPokedAt: catalog.lastPokedAt,
      };
      rooms.set(catalog.id, restored);
    }
    return restored.room;
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
          awaitingChainSync: entry.awaitingChainSync,
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

/**
 * Record the peer's pokeHandle for a room when first seen in a `chat.create`
 * or `chat.register` payload. No-op if already set to the same value.
 * Called by the chain-sync layer; safe to call multiple times.
 * @see docs/features/peer-wake-notification.md
 */
export function storePartnerPokeHandle(roomId: string, handle: string): void {
  if (!handle || !/^[A-Za-z0-9_-]{14}$/.test(handle)) return;
  const state = rooms.get(roomId);
  if (state) {
    if (state.room.partnerPokeHandle === handle) return;
    state.room = { ...state.room, partnerPokeHandle: handle };
    rooms.set(roomId, state);
  }
  patchCatalogRoom(roomId, { partnerPokeHandle: handle });
}

function localMessageRetentionOn(): boolean {
  return useSettingsStore.getState().privacy.localMessageRetention === true;
}

/** Save in-memory room messages into the encrypted wallet blob. */
export async function saveChatRoomsToWallet(): Promise<void> {
  if (!localMessageRetentionOn()) return;
  const rt = getRuntime();
  if (!rt) return;
  const bag: Record<string, ChatMessage[]> = {};
  for (const [roomId, list] of messagesByRoom.entries()) {
    bag[roomId] = [...list];
  }
  rt.raw = saveActiveMessages(rt.raw, bag);
  await persistRuntime(rt);
}

/**
 * Load chatRooms (skip live bodies when retention off) then merge L1′ relays.
 * @see openspec/changes/p2p-message-retention/specs/chat-room-persistence/spec.md
 */
export function hydrateChatRoomsFromWallet(): void {
  const rt = getRuntime();
  if (!rt) return;
  const roomsMap = readChatRooms(rt.raw);
  const restoreBodies = localMessageRetentionOn();
  for (const [roomId, entry] of Object.entries(roomsMap)) {
    if (entry.revoked === true) {
      rememberRevokedRoom(roomId);
      messagesByRoom.delete(roomId);
      continue;
    }
    if (isRoomRevoked(roomId)) continue;
    if (!restoreBodies) continue;
    const existing = messagesByRoom.get(roomId) ?? [];
    if (existing.length > 0) continue;
    messagesByRoom.set(roomId, [...entry.messages]);
  }
  mergeL1RelayTranscripts(rt.raw);
}

function isRoomBlockedForL1Hydrate(raw: RawWalletV1, roomId: string): boolean {
  if (isRoomRevoked(roomId)) return true;
  return readChatRooms(raw)[roomId]?.revoked === true;
}

/** Merge parsed L1′ relay rows; existing live id wins. */
function mergeL1RelayTranscripts(raw: RawWalletV1): void {
  const rows: Array<{ record: SdkMessageRecord; direction: "out" | "in" }> = [
    ...readSentRecords(raw).map((record) => ({
      record,
      direction: "out" as const,
    })),
    ...readReceivedRecords(raw).map((record) => ({
      record,
      direction: "in" as const,
    })),
  ];
  for (const { record, direction } of rows) {
    const parsed = parseChatSmartBody(record.body, { allowSeenReplay: true });
    if (parsed?.action !== "relay") continue;
    const { roomId, sentAt, text } = parsed.payload;
    if (isRoomBlockedForL1Hydrate(raw, roomId)) continue;
    const id = relayMessageId(roomId, sentAt, text);
    const existing = messagesByRoom.get(roomId) ?? [];
    if (existing.some((m) => m.id === id)) continue;
    messagesByRoom.set(roomId, [
      ...existing,
      {
        id,
        roomId,
        direction,
        text,
        createdAt: new Date(sentAt * 1000).toISOString(),
        status: "delivered",
        channel: "relay",
        kind: "text",
      },
    ]);
  }
}

const LIVE_FLUSH_COALESCE_MS = 1000;
let liveFlushTimer: ReturnType<typeof setTimeout> | null = null;

function clearLiveTranscriptFlushTimer(): void {
  if (liveFlushTimer == null) return;
  clearTimeout(liveFlushTimer);
  liveFlushTimer = null;
}

/** Hide checkpoint: same gated write as Exit. No-op if locked or retention off. */
export async function flushChatTranscriptsOnHide(): Promise<void> {
  clearLiveTranscriptFlushTimer();
  try {
    await saveChatRoomsToWallet();
  } catch {
    /* hide must not throw into UI */
  }
}

/** Coalesce L2 persist after live send/receive (~1s). */
export function scheduleLiveTranscriptFlush(): void {
  clearLiveTranscriptFlushTimer();
  liveFlushTimer = setTimeout(() => {
    liveFlushTimer = null;
    void saveChatRoomsToWallet();
  }, LIVE_FLUSH_COALESCE_MS);
}

/** True when body is chat.relay for this room (fail closed: keep unparsed). */
function isRelayBodyForRoom(body: string, roomId: string): boolean {
  const parsed = parseChatSmartBody(body, { allowSeenReplay: true });
  return parsed?.action === "relay" && parsed.payload.roomId === roomId;
}

function pruneRelayRecordsForRoom(
  raw: RawWalletV1,
  roomId: string,
): RawWalletV1 {
  const keep = (record: SdkMessageRecord) =>
    !isRelayBodyForRoom(record.body, roomId);
  return withReceivedRecords(
    withSentRecords(raw, readSentRecords(raw).filter(keep)),
    readReceivedRecords(raw).filter(keep),
  );
}

async function persistChatRoomTombstone(roomId: string): Promise<void> {
  const rt = getRuntime();
  if (!rt) return;
  rt.raw = pruneRelayRecordsForRoom(tombstoneChatRoom(rt.raw, roomId), roomId);
  try {
    await persistRuntime(rt);
  } catch {
    /* local revoke still recorded */
  }
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
  clearLiveTranscriptFlushTimer();
  for (const u of backendUnsubs) u();
  backendUnsubs = [];
  backendWired = false;
  lastSidecarDetail = undefined;
  connectTimeoutMs = HOLEPUNCH_CONNECT_TIMEOUT_MS;
  skipPostConnectProofForTests = false;
  l2SendHoldMs = L2_RECONNECT_GRACE_MS;
  rooms.clear();
  messagesByRoom.clear();
  subscribers.clear();
  roomStateSubscribers.clear();
  topicRooms.clear();
  contractsByRoom.clear();
  inFlightConnects.clear();
  nextAutoRetryAt.clear();
  lastLiveAtMsByRoom.clear();
  l2BlipStartedAtByRoom.clear();
  __setHolepunchSidecarBackend(null);
}

/** Test helper: seed in-memory transcript for a room. */
export function __seedRoomMessagesForTests(
  roomId: string,
  msgs: ChatMessage[],
): void {
  messagesByRoom.set(roomId, [...msgs]);
}

/** @deprecated use __setHolepunchSidecarBackend from HolepunchSidecarClient */
export { __setHolepunchSidecarBackend };
