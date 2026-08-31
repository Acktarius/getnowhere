import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConcealSmartMessageAdapter } from "../../src/services/conceal/ConcealSmartMessageAdapter";
import {
  __resetHolepunchTransport,
  __setHolepunchConnectTimeoutMs,
  __setHolepunchSkipProof,
  __setL2SendHoldMs,
  HolepunchChatTransport,
} from "../../src/services/p2p/HolepunchChatTransport";
import {
  __setHolepunchSidecarBackend,
  type HolepunchSidecarBackend,
} from "../../src/services/p2p/HolepunchSidecarClient";
import { P2PEncryptionAdapter } from "../../src/services/p2p/P2PEncryptionAdapter";
import { SessionBootstrapAdapter } from "../../src/services/p2p/sessionBootstrap";
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
    nonceSeed: "ff".repeat(16),
    nonceStrategy: "counter_from_seed",
    salt: "11".repeat(16),
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
  return { contract };
}

function createControllablePeerBackend(): {
  backend: HolepunchSidecarBackend;
  setPeerCount(topicRef: string, count: number): void;
} {
  const peerCounts = new Map<string, number>();
  const peerHandlers = new Set<(topicRef: string, count: number) => void>();
  const frameHandlers = new Set<
    (msg: { topicRef: string; roomId: string; payload: string }) => void
  >();
  const statusHandlers = new Set<
    (status: "online" | "offline", detail?: string) => void
  >();
  const joined = new Map<string, string>();

  function emitPeers(topicRef: string): void {
    const count = peerCounts.get(topicRef) ?? 0;
    for (const h of peerHandlers) h(topicRef, count);
  }

  const backend: HolepunchSidecarBackend = {
    async ensureConnected() {
      for (const h of statusHandlers) h("online");
    },
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
    sendFrame() {},
    getPeerCount(topicRef) {
      return peerCounts.get(topicRef) ?? 0;
    },
    onPeers(handler) {
      peerHandlers.add(handler);
      return () => {
        peerHandlers.delete(handler);
      };
    },
    onFrame(handler) {
      frameHandlers.add(handler);
      return () => {
        frameHandlers.delete(handler);
      };
    },
    onConnectionStatus(handler) {
      statusHandlers.add(handler);
      return () => {
        statusHandlers.delete(handler);
      };
    },
    close() {
      joined.clear();
      peerCounts.clear();
    },
  };

  return {
    backend,
    setPeerCount(topicRef, count) {
      peerCounts.set(topicRef, count);
      emitPeers(topicRef);
    },
  };
}

describe("L2 reconnect grace", () => {
  beforeEach(() => {
    __resetHolepunchTransport();
    __setHolepunchConnectTimeoutMs(500);
    __setHolepunchSkipProof(true);
  });

  it("promotes connecting → connected when peers return after brief loss", async () => {
    const { backend, setPeerCount } = createControllablePeerBackend();
    __setHolepunchSidecarBackend(backend);
    const { contract } = await buildContract("room-grace", "inv-grace");
    const room = await HolepunchChatTransport.connect(contract);
    expect(room.lifecycleStatus).toBe("connected");

    setPeerCount(contract.transport.topicRef, 0);
    const lost = await HolepunchChatTransport.getRoom("room-grace");
    expect(lost?.lifecycleStatus).toBe("connecting");

    setPeerCount(contract.transport.topicRef, 1);
    const restored = await HolepunchChatTransport.getRoom("room-grace");
    expect(restored?.lifecycleStatus).toBe("connected");
  });

  it("waits for L2 reconnect before L1′ when live traffic was recent", async () => {
    const relaySpy = vi
      .spyOn(ConcealSmartMessageAdapter, "sendChatRelay")
      .mockResolvedValue(undefined as never);

    const { backend, setPeerCount } = createControllablePeerBackend();
    __setHolepunchSidecarBackend(backend);
    const { contract } = await buildContract("room-send", "inv-send");
    await HolepunchChatTransport.connect(contract);
    await HolepunchChatTransport.sendMessage("room-send", "hello live");
    expect(relaySpy).not.toHaveBeenCalled();

    setPeerCount(contract.transport.topicRef, 0);
    const sendPromise = HolepunchChatTransport.sendMessage(
      "room-send",
      "after blip",
    );
    await new Promise((r) => setTimeout(r, 20));
    setPeerCount(contract.transport.topicRef, 1);
    const msg = await sendPromise;

    expect(msg.channel).toBe("live");
    expect(relaySpy).not.toHaveBeenCalled();
    relaySpy.mockRestore();
  });

  it("still prefers L2 when peer returns after a multi-second blip", async () => {
    const relaySpy = vi
      .spyOn(ConcealSmartMessageAdapter, "sendChatRelay")
      .mockResolvedValue(undefined as never);

    const { backend, setPeerCount } = createControllablePeerBackend();
    __setHolepunchSidecarBackend(backend);
    const { contract } = await buildContract("room-slow", "inv-slow");
    await HolepunchChatTransport.connect(contract);
    await HolepunchChatTransport.sendMessage("room-slow", "hello live");

    setPeerCount(contract.transport.topicRef, 0);
    const sendPromise = HolepunchChatTransport.sendMessage(
      "room-slow",
      "slow return",
    );
    await new Promise((r) => setTimeout(r, 3_100));
    setPeerCount(contract.transport.topicRef, 1);
    const msg = await sendPromise;

    expect(msg.channel).toBe("live");
    expect(relaySpy).not.toHaveBeenCalled();
    relaySpy.mockRestore();
  });

  it("falls back to L1′ only after the L2 hold, and not before", async () => {
    __setL2SendHoldMs(80);
    const relaySpy = vi
      .spyOn(ConcealSmartMessageAdapter, "sendChatRelay")
      .mockResolvedValue(undefined as never);

    const { backend, setPeerCount } = createControllablePeerBackend();
    __setHolepunchSidecarBackend(backend);
    const { contract } = await buildContract("room-hold", "inv-hold");
    await HolepunchChatTransport.connect(contract);
    await HolepunchChatTransport.sendMessage("room-hold", "hello live");

    setPeerCount(contract.transport.topicRef, 0);
    const msg = await HolepunchChatTransport.sendMessage(
      "room-hold",
      "after hold",
    );

    expect(msg.channel).toBe("relay");
    expect(relaySpy).toHaveBeenCalledOnce();
    relaySpy.mockRestore();
  });
});
