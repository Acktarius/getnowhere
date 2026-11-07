/**
 * A peer-count drop re-joins from the saved session.
 * The register probe is not part of that resume.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetHolepunchTransport,
  __setHolepunchConnectTimeoutMs,
  __setHolepunchSkipProof,
  HolepunchChatTransport,
} from "@/services/p2p/HolepunchChatTransport";
import {
  __setHolepunchSidecarBackend,
  type HolepunchSidecarBackend,
} from "@/services/p2p/HolepunchSidecarClient";
import { P2PEncryptionAdapter } from "@/services/p2p/P2PEncryptionAdapter";
import { clearRoomSessionStore } from "@/services/p2p/roomSessionStore";
import { SessionBootstrapAdapter } from "@/services/p2p/sessionBootstrap";
import { completeResponderReconnect } from "@/state/contactsStore";
import type { ChatInviteHandshake } from "@/types/protocol";

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
  return SessionBootstrapAdapter.buildHolepunchContract({
    session,
    invite: handshake,
    peerRole: "initiator",
  });
}

function createJoinCountingBackend(): {
  backend: HolepunchSidecarBackend;
  joins: () => number;
  setPeerCount: (topicRef: string, count: number) => void;
  goOffline: () => void;
} {
  let peerCount = 1;
  let joins = 0;
  const peerHandlers = new Set<(topicRef: string, count: number) => void>();
  let statusHandler: (status: "online" | "offline", detail?: string) => void =
    () => {};

  const backend: HolepunchSidecarBackend = {
    async ensureConnected() {},
    async join() {
      joins += 1;
    },
    async leave() {},
    sendFrame() {},
    getPeerCount() {
      return peerCount;
    },
    onPeers(handler) {
      peerHandlers.add(handler);
      return () => peerHandlers.delete(handler);
    },
    onFrame() {
      return () => {};
    },
    onConnectionStatus(handler) {
      statusHandler = handler;
      return () => {};
    },
    close() {},
  };

  return {
    backend,
    joins: () => joins,
    setPeerCount(topicRef, count) {
      peerCount = count;
      for (const handler of peerHandlers) handler(topicRef, count);
    },
    goOffline() {
      statusHandler("offline");
    },
  };
}

describe("saved-session rejoin after peer loss", () => {
  beforeEach(() => {
    __resetHolepunchTransport();
    clearRoomSessionStore();
    __setHolepunchSkipProof(true);
    __setHolepunchConnectTimeoutMs(300);
  });

  it("calls join again when the peer count drops to 0", async () => {
    const mesh = createJoinCountingBackend();
    __setHolepunchSidecarBackend(mesh.backend);
    const contract = await buildContract("room-rejoin", "inv-rejoin");
    const room = await HolepunchChatTransport.connect(contract);
    expect(room.lifecycleStatus).toBe("connected");
    expect(mesh.joins()).toBe(1);

    mesh.setPeerCount(contract.transport.topicRef, 0);

    await vi.waitFor(() => {
      expect(mesh.joins()).toBe(2);
    });
  });

  it("resumes a connecting offline room from the saved session", async () => {
    const mesh = createJoinCountingBackend();
    __setHolepunchSidecarBackend(mesh.backend);
    const contract = await buildContract("room-offline", "inv-offline");
    const room = await HolepunchChatTransport.connect(contract);
    expect(room.lifecycleStatus).toBe("connected");

    mesh.goOffline();
    const lost = await HolepunchChatTransport.getRoom("room-offline");
    expect(lost?.lifecycleStatus).toBe("connecting");
    expect(lost?.peerStatus).toBe("offline");
    const joinsBefore = mesh.joins();

    const ok = await completeResponderReconnect("room-offline");

    expect(ok).toBe(true);
    expect(mesh.joins()).toBeGreaterThan(joinsBefore);
  });
});
