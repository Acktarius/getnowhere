import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetHolepunchTransport,
  __setHolepunchConnectTimeoutMs,
  __setHolepunchSkipProof,
  HolepunchChatTransport,
} from "../../src/services/p2p/HolepunchChatTransport";
import {
  __setHolepunchSidecarBackend,
  createAutoPeerSidecarBackend,
  createMemorySidecarBackend,
  type HolepunchSidecarBackend,
} from "../../src/services/p2p/HolepunchSidecarClient";
import { P2PEncryptionAdapter } from "../../src/services/p2p/P2PEncryptionAdapter";
import { loadCatalogRoom } from "../../src/services/p2p/roomCatalogStore";
import { SessionBootstrapAdapter } from "../../src/services/p2p/sessionBootstrap";
import { isRelayEligibleStatus } from "../../src/services/protocol/roomLifecycle";
import type { ChatInviteHandshake } from "../../src/types/protocol";

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
    nonceSeed: "ab".repeat(16),
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
  return { handshake, session, contract };
}

/** Backend whose `join` always rejects, simulating an unreachable sidecar. */
function createUnreachableSidecarBackend(): HolepunchSidecarBackend {
  return {
    async ensureConnected() {},
    async join() {
      throw new Error("Holepunch sidecar offline");
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
  };
}

describe("softLeaveAll leaves swarm without revoking", () => {
  beforeEach(() => {
    __resetHolepunchTransport();
  });

  it("calls backend leave for joined topics but keeps catalog and room state", async () => {
    const leave = vi.fn(async () => undefined);
    const base = createAutoPeerSidecarBackend();
    __setHolepunchSidecarBackend({
      ...base,
      leave: (topicRef, roomId) => leave(topicRef, roomId),
    });
    __setHolepunchSkipProof(true);

    const roomId = "room-soft-leave";
    const { handshake, session, contract } = await buildContract(
      roomId,
      "inv-soft-leave",
    );
    await HolepunchChatTransport.createRoom({
      contactId: "c1",
      bootstrap: {
        roomId,
        roomKeyRef: session.sessionId,
        bootstrapSource: "conceal-smart-message",
        lifecycleStatus: "accepted",
        inviteId: "inv-soft-leave",
        roomTtl: handshake.roomTtl,
      },
    });
    await HolepunchChatTransport.connect(contract);

    expect(typeof HolepunchChatTransport.softLeaveAll).toBe("function");
    await HolepunchChatTransport.softLeaveAll();

    expect(leave).toHaveBeenCalled();
    expect(loadCatalogRoom(roomId)).toBeTruthy();
    expect(await HolepunchChatTransport.getRoom(roomId)).toBeTruthy();
  });
});

describe("leaveRoom is leave-forever", () => {
  beforeEach(() => {
    __resetHolepunchTransport();
  });

  it("exposes leaveRoom (not disconnect) and removes the room from the catalog", async () => {
    const roomId = "room-leave-forever";
    await HolepunchChatTransport.createRoom({
      contactId: "c1",
      bootstrap: {
        roomId,
        roomKeyRef: "key:room-leave-forever",
        bootstrapSource: "conceal-smart-message",
        lifecycleStatus: "accepted",
        inviteId: "inv-leave-forever",
      },
    });
    expect(loadCatalogRoom(roomId)).toBeTruthy();

    expect("disconnect" in HolepunchChatTransport).toBe(false);
    expect(typeof HolepunchChatTransport.leaveRoom).toBe("function");

    await HolepunchChatTransport.leaveRoom(roomId);

    expect(loadCatalogRoom(roomId)).toBeUndefined();
    expect(await HolepunchChatTransport.getRoom(roomId)).toBeNull();
  });
});

describe("post-accept lifecycle survives stale bootstrap hydration", () => {
  beforeEach(() => {
    __resetHolepunchTransport();
  });

  it("does not let a stale pending bootstrap regress an already-failed room", async () => {
    const roomId = "room-monotonic";
    await HolepunchChatTransport.createRoom({
      contactId: "c1",
      bootstrap: {
        roomId,
        roomKeyRef: "key:room-monotonic",
        bootstrapSource: "conceal-smart-message",
        lifecycleStatus: "connect_failed",
        inviteId: "inv-monotonic",
      },
    });

    // Simulates ContactDetailScreen re-opening the same room with a fresh
    // "pending shell" bootstrap payload while the room already failed once.
    const reopened = await HolepunchChatTransport.createRoom({
      contactId: "c1",
      bootstrap: {
        roomId,
        roomKeyRef: "key:room-monotonic",
        bootstrapSource: "conceal-smart-message",
        lifecycleStatus: "pending",
      },
    });

    expect(reopened.lifecycleStatus).toBe("connect_failed");
    expect(isRelayEligibleStatus(reopened.lifecycleStatus)).toBe(true);
    const fetched = await HolepunchChatTransport.getRoom(roomId);
    expect(fetched?.lifecycleStatus).toBe("connect_failed");
  });
});

describe("connection failure is durable", () => {
  beforeEach(() => {
    __resetHolepunchTransport();
  });

  it("persists connect_failed + failure code when the sidecar is unreachable", async () => {
    __setHolepunchSidecarBackend(createUnreachableSidecarBackend());
    const { handshake, session, contract } = await buildContract(
      "room-unreachable",
      "inv-unreachable",
    );

    await HolepunchChatTransport.createRoom({
      contactId: "c1",
      bootstrap: {
        roomId: "room-unreachable",
        roomKeyRef: session.sessionId,
        bootstrapSource: "conceal-smart-message",
        lifecycleStatus: "accepted",
        inviteId: "inv-unreachable",
        roomTtl: handshake.roomTtl,
      },
    });

    const result = await HolepunchChatTransport.connect(contract);
    expect(result.lifecycleStatus).toBe("connect_failed");
    expect(result.lastConnectError).toBe("unreachable");

    const catalog = loadCatalogRoom("room-unreachable");
    expect(catalog?.lifecycleStatus).toBe("connect_failed");
    expect(catalog?.lastConnectError).toBe("unreachable");

    // Reload: in-memory transport state is gone, catalog is the only truth.
    __resetHolepunchTransport();
    __setHolepunchSidecarBackend(createUnreachableSidecarBackend());
    const reloaded = await HolepunchChatTransport.getRoom("room-unreachable");
    expect(reloaded?.lifecycleStatus).toBe("connect_failed");
    expect(reloaded?.lastConnectError).toBe("unreachable");
    expect(isRelayEligibleStatus(reloaded!.lifecycleStatus)).toBe(true);
  });
});

describe("Holepunch connection attempts are single-flight", () => {
  beforeEach(() => {
    __resetHolepunchTransport();
  });

  it("shares one attempt across concurrent connect callers", async () => {
    __setHolepunchSidecarBackend(createAutoPeerSidecarBackend());
    __setHolepunchSkipProof(true);
    const { handshake, session, contract } = await buildContract(
      "room-singleflight",
      "inv-singleflight",
    );

    await HolepunchChatTransport.createRoom({
      contactId: "c1",
      bootstrap: {
        roomId: "room-singleflight",
        roomKeyRef: session.sessionId,
        bootstrapSource: "conceal-smart-message",
        lifecycleStatus: "accepted",
        inviteId: "inv-singleflight",
        roomTtl: handshake.roomTtl,
      },
    });

    const [first, second] = await Promise.all([
      HolepunchChatTransport.connect(contract),
      HolepunchChatTransport.connect(contract),
    ]);

    expect(first.lifecycleStatus).toBe("connected");
    expect(second.lifecycleStatus).toBe("connected");
    expect(first.connectAttempts).toBe(1);
    expect(second.connectAttempts).toBe(1);
  });

  it("releases the guard on settlement so a later retry can start a fresh attempt", async () => {
    __setHolepunchSidecarBackend(createMemorySidecarBackend());
    __setHolepunchConnectTimeoutMs(60);
    const { handshake, session, contract } = await buildContract(
      "room-retry-after-settle",
      "inv-retry-after-settle",
    );

    await HolepunchChatTransport.createRoom({
      contactId: "c1",
      bootstrap: {
        roomId: "room-retry-after-settle",
        roomKeyRef: session.sessionId,
        bootstrapSource: "conceal-smart-message",
        lifecycleStatus: "accepted",
        inviteId: "inv-retry-after-settle",
        roomTtl: handshake.roomTtl,
      },
    });

    const failed = await HolepunchChatTransport.connect(contract);
    expect(failed.lifecycleStatus).toBe("connect_failed");
    expect(failed.connectAttempts).toBe(1);

    // Immediately retrying (poll-driven) before backoff elapses must not
    // start a second attempt.
    const tooSoon = await HolepunchChatTransport.connect(contract);
    expect(tooSoon.connectAttempts).toBe(1);

    // Once backoff has elapsed, a new attempt is allowed.
    await new Promise((r) => setTimeout(r, 1300));
    const retried = await HolepunchChatTransport.connect(contract);
    expect(retried.connectAttempts).toBe(2);
  });
});
