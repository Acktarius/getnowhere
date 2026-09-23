import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetHolepunchTransport,
  __setHolepunchProofTimeoutMs,
  __setHolepunchSkipProof,
  HolepunchChatTransport,
  subscribeRoomState,
} from "@/services/p2p/HolepunchChatTransport";
import {
  __setHolepunchSidecarBackend,
  type HolepunchSidecarBackend,
} from "@/services/p2p/HolepunchSidecarClient";
import { P2PEncryptionAdapter } from "@/services/p2p/P2PEncryptionAdapter";
import { SessionBootstrapAdapter } from "@/services/p2p/sessionBootstrap";
import { buildProofAad } from "@/services/protocol/proofAad";
import type { ChatInviteHandshake, P2PSessionConfig } from "@/types/protocol";

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
    nonceSeed: "ab".repeat(8),
    nonceStrategy: "counter_from_seed",
    salt: "cd".repeat(16),
    inviteExpiry: now + 3600,
    roomTtl: now + 86400,
    replayId: `replay-${inviteId}`,
  };
  const register = {
    type: "chat.register" as const,
    inviteId,
    receiverEphemeralPublicKey: bob.publicKeyHex,
    replayId: handshake.replayId,
  };
  const session = await SessionBootstrapAdapter.deriveSession({
    invite: handshake,
    acceptance: register,
    peerRole: "initiator",
    localPrivateKeyRef: alice.privateKeyRef,
  });
  const contract = await SessionBootstrapAdapter.buildHolepunchContract({
    session,
    invite: handshake,
    peerRole: "initiator",
  });
  return { contract, session };
}

/** Peer count is controllable. Inbound frames are injected. Nothing is answered. */
function createSilentPeerBackend(): {
  backend: HolepunchSidecarBackend;
  setPeerCount(topicRef: string, count: number): void;
  injectFrame(roomId: string, payload: string): void;
  sentFrames: string[];
} {
  const peerCounts = new Map<string, number>();
  const peerHandlers = new Set<(topicRef: string, count: number) => void>();
  const frameHandlers = new Set<
    (msg: { topicRef: string; roomId: string; payload: string }) => void
  >();
  const joined = new Map<string, string>();
  const sentFrames: string[] = [];

  function emitPeers(topicRef: string): void {
    const count = peerCounts.get(topicRef) ?? 0;
    for (const h of peerHandlers) h(topicRef, count);
  }

  const backend: HolepunchSidecarBackend = {
    async ensureConnected() {},
    async join(topicRef, roomId) {
      joined.set(topicRef, roomId);
      peerCounts.set(topicRef, 1);
      emitPeers(topicRef);
    },
    async leave(topicRef) {
      joined.delete(topicRef);
      peerCounts.set(topicRef, 0);
      emitPeers(topicRef);
    },
    sendFrame(_topicRef, _roomId, payload) {
      sentFrames.push(payload);
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
      return () => {};
    },
    close() {
      joined.clear();
      peerCounts.clear();
    },
  };

  return {
    backend,
    sentFrames,
    setPeerCount(topicRef, count) {
      peerCounts.set(topicRef, count);
      emitPeers(topicRef);
    },
    injectFrame(roomId, payload) {
      const topicRef = [...joined.keys()][0] ?? "";
      for (const h of frameHandlers) h({ topicRef, roomId, payload });
    },
  };
}

async function sealPeerProof(local: P2PSessionConfig): Promise<string> {
  const peer: P2PSessionConfig = {
    ...local,
    sendKeyRef: local.recvKeyRef,
    recvKeyRef: local.sendKeyRef,
    sendCounter: 0,
  };
  const envelope = {
    schemaVersion: 1 as const,
    messageId: "proof-stale",
    clientId: "system",
    sentAt: new Date().toISOString(),
    kind: "proof" as const,
    text: `proof:v1:${local.sessionId}`,
  };
  const sealed = await P2PEncryptionAdapter.seal({
    session: peer,
    plaintext: new TextEncoder().encode(JSON.stringify(envelope)),
    aad: buildProofAad(local.roomId, peer),
  });
  const wire = new Uint8Array(sealed.nonce.length + sealed.ciphertext.length);
  wire.set(sealed.nonce, 0);
  wire.set(sealed.ciphertext, sealed.nonce.length);
  return btoa(String.fromCharCode(...wire));
}

describe("post-connect proof on peer return", () => {
  beforeEach(() => {
    __resetHolepunchTransport();
    __setHolepunchProofTimeoutMs(300);
  });

  it("does not mark connected when the returning peer never proves", async () => {
    __setHolepunchSkipProof(true);
    const { backend, setPeerCount } = createSilentPeerBackend();
    __setHolepunchSidecarBackend(backend);
    const { contract } = await buildContract("room-silent", "inv-silent");
    const room = await HolepunchChatTransport.connect(contract);
    expect(room.lifecycleStatus).toBe("connected");

    __setHolepunchSkipProof(false);
    const seen: string[] = [];
    subscribeRoomState("room-silent", (next) => {
      seen.push(next.lifecycleStatus);
    });
    setPeerCount(contract.transport.topicRef, 0);
    setPeerCount(contract.transport.topicRef, 1);

    await vi.waitFor(async () => {
      const current = await HolepunchChatTransport.getRoom("room-silent");
      expect(current?.lifecycleStatus).toBe("connect_failed");
    });
    expect(seen).not.toContain("connected");
  });

  it("ignores a proof that opened before this attempt", async () => {
    __setHolepunchSkipProof(true);
    const { backend, setPeerCount, injectFrame, sentFrames } =
      createSilentPeerBackend();
    __setHolepunchSidecarBackend(backend);
    const { contract, session } = await buildContract(
      "room-stale",
      "inv-stale",
    );
    const room = await HolepunchChatTransport.connect(contract);
    expect(room.lifecycleStatus).toBe("connected");

    injectFrame("room-stale", await sealPeerProof(session));
    await vi.waitFor(() => {
      expect(sentFrames.length).toBeGreaterThan(0);
    });

    __setHolepunchSkipProof(false);
    const seen: string[] = [];
    subscribeRoomState("room-stale", (next) => {
      seen.push(next.lifecycleStatus);
    });
    setPeerCount(contract.transport.topicRef, 0);
    setPeerCount(contract.transport.topicRef, 1);

    await vi.waitFor(async () => {
      const current = await HolepunchChatTransport.getRoom("room-stale");
      expect(current?.lifecycleStatus).toBe("connect_failed");
    });
    expect(seen).not.toContain("connected");
  });
});
