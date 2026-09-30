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
  HolepunchChatTransport,
  LIVE_RESEND_GAP_MS,
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
import { SessionBootstrapAdapter } from "@/services/p2p/sessionBootstrap";

async function buildContract(roomId: string, inviteId: string) {
  const alice = await P2PEncryptionAdapter.generateEphemeralKeypair();
  const bob = await P2PEncryptionAdapter.generateEphemeralKeypair();
  const now = Math.floor(Date.now() / 1000);
  const handshake: ChatInviteHandshake = {
    protocolVersion: 1,
    inviteId,
    relationshipId: `rel-${roomId}`,
    roomId,
    cipherSuite: "CHACHA20_POLY1305_V1",
    senderEphemeralPublicKey: alice.publicKeyHex,
    kdf: "HKDF_SHA256_V1",
    nonceSeed: "dd".repeat(16),
    nonceStrategy: "counter_from_seed",
    salt: "33".repeat(16),
    inviteExpiry: now + 3600,
    roomTtl: now + 86400,
    replayId: `replay-${inviteId}`,
  };
  const session = await SessionBootstrapAdapter.deriveSession({
    invite: handshake,
    acceptance: {
      type: "chat.register",
      inviteId,
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
 * Remote peer on the swarm: opens every frame with its receive key, answers
 * proof requests with a sealed proof-ack, and loses frames while `dropping`.
 */
function createPeer(local: P2PSessionConfig) {
  const peerCounts = new Map<string, number>();
  const peerHandlers = new Set<(topicRef: string, count: number) => void>();
  const frameHandlers = new Set<
    (msg: { topicRef: string; roomId: string; payload: string }) => void
  >();
  let joinedTopic = "";
  let peerSession: P2PSessionConfig = {
    ...local,
    sendKeyRef: local.recvKeyRef,
    recvKeyRef: local.sendKeyRef,
    sendCounter: 0,
    recvCounter: 0,
  };
  const received: ChatContentEnvelopeV1[] = [];
  const state = { dropping: false };

  async function open(payload: string): Promise<ChatContentEnvelopeV1 | null> {
    const frame = decodeLiveFrame(payload);
    if (!frame) return null;
    for (const aad of [
      buildProofAad(local.roomId, peerSession),
      buildChatAad(local.roomId, peerSession),
    ]) {
      const opened = await P2PEncryptionAdapter.open({
        session: peerSession,
        counter: frame.counter,
        ciphertext: frame.ciphertext,
        aad,
      });
      if (opened) {
        peerSession = {
          ...peerSession,
          recvCounter: opened.session.recvCounter,
        };
        return JSON.parse(new TextDecoder().decode(opened.plaintext));
      }
    }
    return null;
  }

  async function answerProof(roomId: string): Promise<void> {
    const envelope = {
      schemaVersion: 1,
      messageId: `ack-${peerSession.sendCounter}`,
      clientId: "system",
      sentAt: new Date().toISOString(),
      kind: "proof",
      text: `proof-ack:v1:${local.sessionId}`,
    };
    const sealed = await P2PEncryptionAdapter.seal({
      session: peerSession,
      plaintext: new TextEncoder().encode(JSON.stringify(envelope)),
      aad: buildProofAad(local.roomId, peerSession),
    });
    peerSession = { ...peerSession, sendCounter: sealed.session.sendCounter };
    const payload = encodeLiveFrame(sealed.counter, sealed.ciphertext);
    for (const h of frameHandlers)
      h({ topicRef: joinedTopic, roomId, payload });
  }

  let inbox = Promise.resolve();
  async function deliver(roomId: string, payload: string): Promise<void> {
    const envelope = await open(payload);
    if (!envelope) return;
    if (envelope.kind === "proof") {
      if (envelope.text?.startsWith("proof:v1:")) await answerProof(roomId);
      return;
    }
    received.push(envelope);
  }

  const backend: HolepunchSidecarBackend = {
    async ensureConnected() {},
    async join(topicRef) {
      joinedTopic = topicRef;
      peerCounts.set(topicRef, 1);
    },
    async leave(topicRef) {
      peerCounts.set(topicRef, 0);
    },
    sendFrame(_topicRef, roomId, payload) {
      if (state.dropping) return;
      inbox = inbox.then(() => deliver(roomId, payload));
    },
    getPeerCount(topicRef) {
      return peerCounts.get(topicRef) ?? 0;
    },
    onPeers(handler) {
      peerHandlers.add(handler);
      return () => peerHandlers.delete(handler);
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
    received,
    state,
    setPeerCount(count: number): void {
      peerCounts.set(joinedTopic, count);
      for (const h of peerHandlers) h(joinedTopic, count);
    },
  };
}

describe("live message lost during an L2 flap", () => {
  beforeEach(() => {
    __resetHolepunchTransport();
    __setHolepunchProofTimeoutMs(1_000);
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

  it("replayed frame opens with the peer key to the original text", async () => {
    const { session, contract } = await buildContract("room-loop", "inv-loop");
    const peer = createPeer(session);
    __setHolepunchSidecarBackend(peer.backend);
    const room = await HolepunchChatTransport.connect(contract);
    expect(room.lifecycleStatus).toBe("connected");

    const text = "are you still there?";
    peer.state.dropping = true;
    const sent = await HolepunchChatTransport.sendMessage(room.id, text);
    expect(sent.status).toBe("sent");
    expect(peer.received).toEqual([]);

    peer.setPeerCount(0);
    expect(
      (await HolepunchChatTransport.getRoom(room.id))?.lifecycleStatus,
    ).toBe("connecting");
    peer.state.dropping = false;
    peer.setPeerCount(1);

    await vi.waitFor(
      () => {
        expect(peer.received).toHaveLength(1);
      },
      { timeout: LIVE_RESEND_GAP_MS + 3_000 },
    );
    expect(peer.received[0]).toMatchObject({
      kind: "text",
      messageId: sent.id,
      text,
    });
    expect(
      (await HolepunchChatTransport.getRoom(room.id))?.lifecycleStatus,
    ).toBe("connected");
  });
});
