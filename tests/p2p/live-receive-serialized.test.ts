import type { RawWalletV1 } from "conceal-wallet-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildChatAad, buildProofAad } from "@/services/protocol/proofAad";
import { setActiveStorageAdapter } from "@/services/storage/StorageAdapter";
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
import {
  deriveFrameNonce,
  P2PEncryptionAdapter,
} from "@/services/p2p/P2PEncryptionAdapter";
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
    nonceSeed: "ee".repeat(16),
    nonceStrategy: "counter_from_seed",
    salt: "22".repeat(16),
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

type SealedFrame = { payload: string; counter: number; ciphertext: Uint8Array };

/** Fake remote peer that answers proof requests from its own send session. */
function createPeer(local: P2PSessionConfig) {
  const frameHandlers = new Set<
    (msg: { topicRef: string; roomId: string; payload: string }) => void
  >();
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
  ): Promise<SealedFrame> {
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
    return {
      payload: encodeLiveFrame(sealed.counter, sealed.ciphertext),
      counter: sealed.counter,
      ciphertext: sealed.ciphertext,
    };
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
    inject(roomId, ack.payload);
  }

  const backend: HolepunchSidecarBackend = {
    async ensureConnected() {},
    async join(topicRef) {
      joinedTopic = topicRef;
    },
    async leave() {},
    sendFrame(_topicRef, roomId, payload) {
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

  return { backend, seal, inject };
}

function textEnvelope(text: string): ChatContentEnvelopeV1 {
  return {
    schemaVersion: 1,
    messageId: `m-${text}`,
    clientId: `c-${text}`,
    sentAt: new Date().toISOString(),
    kind: "text",
    text,
  };
}

async function connectRoom(roomId: string) {
  const { session, contract } = await buildContract(roomId);
  const peer = createPeer(session);
  __setHolepunchSidecarBackend(peer.backend);
  const room = await HolepunchChatTransport.connect(contract);
  expect(room.lifecycleStatus).toBe("connected");
  const seen: ChatMessage[] = [];
  HolepunchChatTransport.subscribe(room.id, (m) => seen.push(m));
  return { peer, session, room, seen };
}

const settle = () => new Promise((r) => setTimeout(r, 50));

describe("inbound live frames are handled one at a time per room", () => {
  beforeEach(() => {
    __resetHolepunchTransport();
    __setHolepunchProofTimeoutMs(300);
    const mem = new Map<string, string>();
    setActiveStorageAdapter({
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => {
        mem.set(k, v);
      },
      removeItem: (k) => {
        mem.delete(k);
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("duplicate frame is accepted once", async () => {
    const { peer, room, seen } = await connectRoom("room-dup-frame");
    const openSpy = vi.spyOn(P2PEncryptionAdapter, "open");
    const envelope = textEnvelope("dup");
    const frame = await peer.seal(envelope, "chat");

    peer.inject(room.id, frame.payload);
    peer.inject(room.id, frame.payload);
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    await settle();

    const accepted = await Promise.all(
      openSpy.mock.results.map((r) => r.value),
    );
    expect(accepted.filter((r) => r !== null)).toHaveLength(1);
    expect(seen).toHaveLength(1);
    expect(
      getMessagesForRoom(room.id).filter((m) => m.id === envelope.messageId),
    ).toHaveLength(1);
    expect(loadRoomSession(room.id)?.recvCounter).toBe(frame.counter + 1);
  });

  it("opens a frame after the peer skipped 100 counters", async () => {
    const { peer, room, seen } = await connectRoom("room-gap");
    for (let i = 0; i < 100; i++) {
      await peer.seal(textEnvelope(`lost-${i}`), "chat");
    }
    const envelope = textEnvelope("after-gap");
    const frame = await peer.seal(envelope, "chat");
    expect(frame.counter).toBeGreaterThan(
      (loadRoomSession(room.id)?.recvCounter ?? 0) + 99,
    );

    peer.inject(room.id, frame.payload);
    await vi.waitFor(() => expect(seen).toHaveLength(1));

    expect(seen[0]?.id).toBe(envelope.messageId);
    expect(getMessagesForRoom(room.id).map((m) => m.id)).toContain(
      envelope.messageId,
    );
    expect(loadRoomSession(room.id)?.recvCounter).toBe(frame.counter + 1);
  });

  it("drops an old-layout nonce||ciphertext frame", async () => {
    const { peer, session, room, seen } = await connectRoom("room-old-layout");
    const recvBefore = loadRoomSession(room.id)?.recvCounter;
    const frame = await peer.seal(textEnvelope("old"), "chat");
    const nonce = deriveFrameNonce(session.nonceSeed, frame.counter);
    const wire = new Uint8Array(nonce.length + frame.ciphertext.length);
    wire.set(nonce, 0);
    wire.set(frame.ciphertext, nonce.length);

    peer.inject(room.id, btoa(String.fromCharCode(...wire)));
    await settle();

    expect(seen).toEqual([]);
    expect(getMessagesForRoom(room.id)).toEqual([]);
    expect(loadRoomSession(room.id)?.recvCounter).toBe(recvBefore);
  });
});
