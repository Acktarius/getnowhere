// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetHolepunchTransport,
  __setHolepunchConnectTimeoutMs,
  __setHolepunchSkipProof,
  HolepunchChatTransport,
  restoreRoomSession,
} from "@/services/p2p/HolepunchChatTransport";
import {
  __setHolepunchSidecarBackend,
  type HolepunchSidecarBackend,
} from "@/services/p2p/HolepunchSidecarClient";
import { P2PEncryptionAdapter } from "@/services/p2p/P2PEncryptionAdapter";
import { reusableSessionBlock } from "@/services/p2p/reusableSession";
import {
  clearRoomSessionStore,
  loadRoomSession,
  saveRoomSession,
} from "@/services/p2p/roomSessionStore";
import { SessionBootstrapAdapter } from "@/services/p2p/sessionBootstrap";
import type { ChatInviteHandshake } from "@/types/protocol";

async function buildContract(roomId: string, inviteId: string) {
  const alice = await P2PEncryptionAdapter.generateEphemeralKeypair();
  const bob = await P2PEncryptionAdapter.generateEphemeralKeypair();
  const now = Math.floor(Date.now() / 1000);
  const handshake: ChatInviteHandshake = {
    protocolVersion: 2,
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
    topicSuite: "HKDF_EPOCH_V1",
    topicEpoch: 0,
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

function countingBackend(): {
  backend: HolepunchSidecarBackend;
  topics: () => string[];
} {
  const topics: string[] = [];
  const backend: HolepunchSidecarBackend = {
    async ensureConnected() {},
    async join(topicRef) {
      topics.push(topicRef);
    },
    async leave() {},
    sendFrame() {},
    getPeerCount() {
      return 1;
    },
    onPeers() {
      return () => {};
    },
    onFrame() {
      return () => {};
    },
    onConnectionStatus() {
      return () => {};
    },
    close() {},
  };
  return { backend, topics: () => topics };
}

describe("saved topic rejoin", () => {
  beforeEach(() => {
    __resetHolepunchTransport();
    clearRoomSessionStore();
    __setHolepunchSkipProof(true);
    __setHolepunchConnectTimeoutMs(300);
  });

  it("does not mark a locked join as unreachable", async () => {
    const topics: string[] = [];
    __setHolepunchSidecarBackend({
      async ensureConnected() {},
      async join() {
        throw new Error("App access locked");
      },
      async leave() {},
      sendFrame() {},
      getPeerCount() {
        return 0;
      },
      onPeers() {
        return () => {};
      },
      onFrame() {
        return () => {};
      },
      onConnectionStatus() {
        return () => {};
      },
      close() {},
    });
    const contract = await buildContract("room-locked", "inv-locked");

    const room = await HolepunchChatTransport.connect(contract);

    expect(topics).toEqual([]);
    expect(room.lastConnectError).not.toBe("unreachable");
    expect(room.connectAttempts ?? 0).toBe(0);
    expect(room.lifecycleStatus).not.toBe("connect_failed");
  });

  it("rejoins the stored topicRef after the in-memory room is gone", async () => {
    const mesh = countingBackend();
    __setHolepunchSidecarBackend(mesh.backend);
    const contract = await buildContract("room-stored", "inv-stored");
    const room = await HolepunchChatTransport.connect(contract);
    expect(room.lifecycleStatus).toBe("connected");
    const topicRef = contract.transport.topicRef;
    expect(mesh.topics()).toEqual([topicRef]);
    expect(loadRoomSession(contract.roomId)?.contract.transport.topicRef).toBe(
      topicRef,
    );

    __resetHolepunchTransport();
    __setHolepunchSkipProof(true);
    __setHolepunchSidecarBackend(mesh.backend);
    const restored = await restoreRoomSession(contract.roomId);

    expect(restored?.lifecycleStatus).toBe("connected");
    expect(mesh.topics()).toEqual([topicRef, topicRef]);
  });

  it("does not join when the saved topic is not reusable", async () => {
    const mesh = countingBackend();
    __setHolepunchSidecarBackend(mesh.backend);
    const contract = await buildContract("room-bad", "inv-bad");
    const broken = {
      ...contract,
      transport: { ...contract.transport, topicRef: "not-a-topic" },
    };
    await saveRoomSession({
      roomId: broken.roomId,
      contactId: "contact",
      contract: broken,
      sendKeyHex: "aa",
      recvKeyHex: "bb",
      sendCounter: 0,
      recvCounter: 0,
      savedAt: new Date().toISOString(),
    });
    expect(reusableSessionBlock(loadRoomSession(broken.roomId))).toBe(
      "unsupported",
    );

    const restored = await restoreRoomSession(broken.roomId);

    expect(restored).toBeNull();
    expect(mesh.topics()).toEqual([]);
  });
});
