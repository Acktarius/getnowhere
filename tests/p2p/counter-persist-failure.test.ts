import type { RawWalletV1 } from "conceal-wallet-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildChatAad, buildProofAad } from "@/services/protocol/proofAad";
import type {
  MobilePrefsBackend,
  MobileWalletFileBackend,
} from "@/services/storage/adapters/mobileNativeStorageAdapter";
import {
  installMobileNativeStorageAdapter,
  resetMobileNativeStorageForTests,
} from "@/services/storage/installMobileNativeStorage";
import {
  setActiveStorageAdapter,
  webStorageAdapter,
} from "@/services/storage/StorageAdapter";
import type {
  ChatContentEnvelopeV1,
  ChatInviteHandshake,
  P2PSessionConfig,
} from "@/types/protocol";

vi.mock("@/services/conceal/sync/runtime", () => ({
  getRuntime: () => ({
    raw: {
      deposits: [],
      withdrawals: [],
      transactions: [],
      lastHeight: 0,
      nonce: "",
    } satisfies RawWalletV1,
    password: "test",
    state: {},
  }),
  persistRuntime: async () => undefined,
}));

import {
  __resetHolepunchTransport,
  __setHolepunchProofTimeoutMs,
  getMessagesForRoom,
  HolepunchChatTransport,
} from "@/services/p2p/HolepunchChatTransport";
import {
  __setHolepunchSidecarBackend,
  type HolepunchSidecarBackend,
} from "@/services/p2p/HolepunchSidecarClient";
import {
  decodeLiveFrame,
  encodeLiveFrame,
} from "@/services/p2p/liveFrameCodec";
import { P2PEncryptionAdapter } from "@/services/p2p/P2PEncryptionAdapter";
import { loadRoomSession } from "@/services/p2p/roomSessionStore";
import { SessionBootstrapAdapter } from "@/services/p2p/sessionBootstrap";
import type { ChatMessage } from "@/types/models";

async function buildContract(roomId: string) {
  const alice = await P2PEncryptionAdapter.generateEphemeralKeypair();
  const bob = await P2PEncryptionAdapter.generateEphemeralKeypair();
  const now = Math.floor(Date.now() / 1000);
  const handshake: ChatInviteHandshake = {
    protocolVersion: 1,
    inviteId: `inv-${roomId}`,
    relationshipId: `rel-${roomId}`,
    roomId,
    cipherSuite: "CHACHA20_POLY1305_V1",
    senderEphemeralPublicKey: alice.publicKeyHex,
    kdf: "HKDF_SHA256_V1",
    nonceSeed: "cc".repeat(16),
    nonceStrategy: "counter_from_seed",
    salt: "44".repeat(16),
    inviteExpiry: now + 3600,
    roomTtl: now + 86400,
    replayId: `replay-inv-${roomId}`,
  };
  const session = await SessionBootstrapAdapter.deriveSession({
    invite: handshake,
    acceptance: {
      type: "chat.register",
      inviteId: handshake.inviteId,
      receiverEphemeralPublicKey: bob.publicKeyHex,
      replayId: handshake.replayId,
    },
    peerRole: "initiator",
    localPrivateKeyRef: alice.privateKeyRef,
  });
  const contract = await SessionBootstrapAdapter.buildHolepunchContract({
    session,
    invite: handshake,
    peerRole: "initiator",
  });
  return { session, contract };
}

/** Fake remote peer: answers proof requests and records every frame handed to the bridge. */
function createPeer(local: P2PSessionConfig) {
  const frameHandlers = new Set<
    (msg: { topicRef: string; roomId: string; payload: string }) => void
  >();
  const sentFrames: string[] = [];
  let joinedTopic = "";
  let peerSend: P2PSessionConfig = {
    ...local,
    sendKeyRef: local.recvKeyRef,
    recvKeyRef: local.sendKeyRef,
    sendCounter: 0,
    recvCounter: 0,
  };

  async function seal(
    envelope: ChatContentEnvelopeV1,
    aadKind: "chat" | "proof",
  ): Promise<string> {
    const aad =
      aadKind === "proof"
        ? buildProofAad(local.roomId, peerSend)
        : buildChatAad(local.roomId, peerSend);
    const sealed = await P2PEncryptionAdapter.seal({
      session: peerSend,
      plaintext: new TextEncoder().encode(JSON.stringify(envelope)),
      aad,
    });
    peerSend = { ...peerSend, sendCounter: sealed.session.sendCounter };
    return encodeLiveFrame(sealed.counter, sealed.ciphertext);
  }

  function inject(roomId: string, payload: string): void {
    for (const h of frameHandlers)
      h({ topicRef: joinedTopic, roomId, payload });
  }

  async function answerProof(roomId: string, payload: string): Promise<void> {
    const frame = decodeLiveFrame(payload);
    if (!frame) return;
    const recv = { ...peerSend, recvCounter: 0 };
    const opened = await P2PEncryptionAdapter.open({
      session: recv,
      counter: frame.counter,
      ciphertext: frame.ciphertext,
      aad: buildProofAad(local.roomId, recv),
    });
    if (!opened) return;
    const text = JSON.parse(new TextDecoder().decode(opened.plaintext)).text;
    if (!String(text).startsWith("proof:v1:")) return;
    const ack = await seal(
      {
        schemaVersion: 1,
        messageId: `peer-ack-${peerSend.sendCounter}`,
        clientId: "system",
        sentAt: new Date().toISOString(),
        kind: "proof",
        text: `proof-ack:v1:${local.sessionId}`,
      },
      "proof",
    );
    inject(roomId, ack);
  }

  const backend: HolepunchSidecarBackend = {
    async ensureConnected() {},
    async join(topicRef) {
      joinedTopic = topicRef;
    },
    async leave() {},
    sendFrame(_topicRef, roomId, payload) {
      sentFrames.push(payload);
      setTimeout(() => void answerProof(roomId, payload), 0);
    },
    getPeerCount() {
      return 1;
    },
    onPeers() {
      return () => undefined;
    },
    onFrame(handler) {
      frameHandlers.add(handler);
      return () => frameHandlers.delete(handler);
    },
    onConnectionStatus() {
      return () => undefined;
    },
    close() {},
  };

  return { backend, seal, inject, sentFrames };
}

/** Secure-prefs backend whose writes fail while `failing` is set. */
function createFailablePrefs(): MobilePrefsBackend & { failing: boolean } {
  const store = new Map<string, string>();
  const prefs = {
    failing: false,
    async get(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string): Promise<void> {
      if (prefs.failing) throw new Error("prefs-write-failed");
      store.set(key, value);
    },
    async remove(key: string): Promise<void> {
      store.delete(key);
    },
  };
  return prefs;
}

const walletFile: MobileWalletFileBackend = {
  async exists() {
    return { ok: true, exists: false };
  },
  async read() {
    return { ok: false, reason: "io-error" };
  },
  async write() {},
  async remove() {},
};

async function connectRoom(roomId: string) {
  const { session, contract } = await buildContract(roomId);
  const peer = createPeer(session);
  __setHolepunchSidecarBackend(peer.backend);
  const room = await HolepunchChatTransport.connect(contract);
  expect(room.lifecycleStatus).toBe("connected");
  const seen: ChatMessage[] = [];
  HolepunchChatTransport.subscribe(room.id, (m) => seen.push(m));
  return { peer, room, seen };
}

const settle = () => new Promise((r) => setTimeout(r, 50));

describe("a failed durable counter write fails closed", () => {
  let prefs: ReturnType<typeof createFailablePrefs>;

  beforeEach(async () => {
    __resetHolepunchTransport();
    __setHolepunchProofTimeoutMs(300);
    prefs = createFailablePrefs();
    await installMobileNativeStorageAdapter({
      isMobile: true,
      backends: { prefs, walletFile },
    });
  });

  afterEach(() => {
    resetMobileNativeStorageForTests();
    setActiveStorageAdapter(webStorageAdapter);
    localStorage.clear();
  });

  it("never calls sendFrame when the counter write fails", async () => {
    const { peer, room, seen } = await connectRoom("room-persist-send");
    await settle();
    const framesBefore = peer.sentFrames.length;
    expect(loadRoomSession(room.id)).toBeDefined();

    prefs.failing = true;
    await expect(
      HolepunchChatTransport.sendMessage(room.id, "must not leave"),
    ).rejects.toThrow();

    expect(peer.sentFrames).toHaveLength(framesBefore);
    expect(
      seen.filter((m) => m.direction === "out" && m.status === "sent"),
    ).toEqual([]);
    expect(
      getMessagesForRoom(room.id).filter((m) => m.direction === "out"),
    ).toEqual([]);
  });

  it("drops an inbound frame whose receive-counter write fails", async () => {
    const { peer, room, seen } = await connectRoom("room-persist-recv");
    await settle();

    prefs.failing = true;
    const envelope: ChatContentEnvelopeV1 = {
      schemaVersion: 1,
      messageId: "m-persist-recv",
      clientId: "c-persist-recv",
      sentAt: new Date().toISOString(),
      kind: "text",
      text: "must not land",
    };
    peer.inject(room.id, await peer.seal(envelope, "chat"));
    await settle();

    expect(seen).toEqual([]);
    expect(
      getMessagesForRoom(room.id).filter((m) => m.id === envelope.messageId),
    ).toEqual([]);

    prefs.failing = false;
    const next: ChatContentEnvelopeV1 = {
      ...envelope,
      messageId: "m-persist-recv-2",
      clientId: "c-persist-recv-2",
      text: "lands after recovery",
    };
    peer.inject(room.id, await peer.seal(next, "chat"));
    await settle();

    expect(seen.map((m) => m.id)).toEqual([next.messageId]);
  });
});
