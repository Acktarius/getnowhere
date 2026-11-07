import type { RawWalletV1 } from "conceal-wallet-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
import { P2PEncryptionAdapter } from "@/services/p2p/P2PEncryptionAdapter";
import { loadRoomSession } from "@/services/p2p/roomSessionStore";
import { SessionBootstrapAdapter } from "@/services/p2p/sessionBootstrap";
import type { ChatMessage } from "@/types/models";

const LOST_FRAMES = 100;

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
    nonceSeed: "ab".repeat(16),
    nonceStrategy: "counter_from_seed",
    salt: "55".repeat(16),
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

/**
 * Remote peer held by the test: answers the connect proof, then swallows
 * every frame while `dropping` (captured, never opened).
 */
function createPeer(local: P2PSessionConfig) {
  const frameHandlers = new Set<
    (msg: { topicRef: string; roomId: string; payload: string }) => void
  >();
  const captured: string[] = [];
  const state = { dropping: false };
  let joinedTopic = "";
  let peer: P2PSessionConfig = {
    ...local,
    sendKeyRef: local.recvKeyRef,
    recvKeyRef: local.sendKeyRef,
    sendCounter: 0,
    recvCounter: 0,
  };

  async function seal(
    envelope: ChatContentEnvelopeV1,
    aad: Uint8Array,
  ): Promise<string> {
    const sealed = await P2PEncryptionAdapter.seal({
      session: peer,
      plaintext: new TextEncoder().encode(JSON.stringify(envelope)),
      aad,
    });
    peer = { ...peer, sendCounter: sealed.session.sendCounter };
    return encodeLiveFrame(sealed.counter, sealed.ciphertext);
  }

  function inject(roomId: string, payload: string): void {
    for (const h of frameHandlers)
      h({ topicRef: joinedTopic, roomId, payload });
  }

  async function answerProof(roomId: string, payload: string): Promise<void> {
    const frame = decodeLiveFrame(payload);
    if (!frame) return;
    const opened = await P2PEncryptionAdapter.open({
      session: peer,
      counter: frame.counter,
      ciphertext: frame.ciphertext,
      aad: buildProofAad(local.roomId, peer),
    });
    if (!opened) return;
    peer = { ...peer, recvCounter: opened.session.recvCounter };
    const text = JSON.parse(new TextDecoder().decode(opened.plaintext)).text;
    if (!String(text).startsWith("proof:v1:")) return;
    const ack = await seal(
      {
        schemaVersion: 1,
        messageId: `peer-ack-${peer.sendCounter}`,
        clientId: "system",
        sentAt: new Date().toISOString(),
        kind: "proof",
        text: `proof-ack:v1:${local.sessionId}`,
      },
      buildProofAad(local.roomId, peer),
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
      if (state.dropping) {
        captured.push(payload);
        return;
      }
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

  return {
    backend,
    captured,
    state,
    inject,
    session: () => peer,
    sealChat: (envelope: ChatContentEnvelopeV1) =>
      seal(envelope, buildChatAad(local.roomId, peer)),
  };
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

describe("L2 resyncs after a long frame gap", () => {
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

  it("lands in the receiver transcript after a 100-frame gap", async () => {
    const { session, contract } = await buildContract("room-gap-loop");
    const peer = createPeer(session);
    __setHolepunchSidecarBackend(peer.backend);
    const room = await HolepunchChatTransport.connect(contract);
    expect(room.lifecycleStatus).toBe("connected");
    const seen: ChatMessage[] = [];
    HolepunchChatTransport.subscribe(room.id, (m) => seen.push(m));
    await vi.waitFor(() =>
      expect(peer.session().recvCounter).toBeGreaterThan(0),
    );
    peer.state.dropping = true;

    // Inbound: the peer's lost frames never reach us.
    for (let i = 0; i < LOST_FRAMES; i++) {
      await peer.sealChat(textEnvelope(`peer-lost-${i}`));
    }
    const inbound = textEnvelope("peer-after-gap");
    const inboundPayload = await peer.sealChat(inbound);
    const inboundFrame = decodeLiveFrame(inboundPayload);
    expect(inboundFrame).not.toBeNull();
    peer.inject(room.id, inboundPayload);

    await vi.waitFor(() =>
      expect(seen.map((m) => m.id)).toContain(inbound.messageId),
    );
    expect(
      getMessagesForRoom(room.id).find((m) => m.id === inbound.messageId),
    ).toMatchObject({ direction: "in", text: inbound.text });
    expect(loadRoomSession(room.id)?.recvCounter).toBe(
      (inboundFrame?.counter ?? Number.NaN) + 1,
    );

    // Outbound: our lost frames never reach the peer; its receive session stays stale.
    const stale = peer.session();
    for (let i = 0; i < LOST_FRAMES; i++) {
      await HolepunchChatTransport.sendMessage(room.id, `local-lost-${i}`);
    }
    const text = "local-after-gap";
    await HolepunchChatTransport.sendMessage(room.id, text);
    const outbound = decodeLiveFrame(peer.captured.at(-1) ?? "");
    expect(outbound).not.toBeNull();
    if (!outbound) return;
    expect(outbound.counter - stale.recvCounter).toBeGreaterThanOrEqual(
      LOST_FRAMES,
    );

    const opened = await P2PEncryptionAdapter.open({
      session: stale,
      counter: outbound.counter,
      ciphertext: outbound.ciphertext,
      aad: buildChatAad(room.id, stale),
    });
    expect(opened).not.toBeNull();
    const envelope = JSON.parse(
      new TextDecoder().decode(opened?.plaintext),
    ) as ChatContentEnvelopeV1;
    expect(envelope.text).toBe(text);
  });
});
