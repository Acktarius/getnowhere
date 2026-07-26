import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConcealSmartMessageAdapter } from "../../src/services/conceal/ConcealSmartMessageAdapter";
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
} from "../../src/services/p2p/HolepunchSidecarClient";
import { P2PEncryptionAdapter } from "../../src/services/p2p/P2PEncryptionAdapter";
import { SessionBootstrapAdapter } from "../../src/services/p2p/sessionBootstrap";
import { canSendLiveMessages } from "../../src/services/protocol/roomLifecycle";
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
  return { handshake, session, contract };
}

describe("session bootstrap + holepunch connect", () => {
  beforeEach(() => {
    __resetHolepunchTransport();
  });

  it("derives session and builds HolepunchBootstrapContract", async () => {
    const aliceKey = await P2PEncryptionAdapter.generateEphemeralKeypair();
    const bobKey = await P2PEncryptionAdapter.generateEphemeralKeypair();
    const now = Math.floor(Date.now() / 1000);
    const handshake: ChatInviteHandshake = {
      protocolVersion: 1,
      inviteId: "inv-x",
      relationshipId: "rel-x",
      roomId: "room-x",
      cipherSuite: "CHACHA20_POLY1305_V1",
      senderEphemeralPublicKey: aliceKey.publicKeyHex,
      kdf: "HKDF_SHA256_V1",
      nonceSeed: "dd".repeat(16),
      nonceStrategy: "counter_from_seed",
      salt: "ee".repeat(16),
      inviteExpiry: now + 3600,
      roomTtl: now + 86400,
      replayId: "replay-x",
    };

    const register = {
      type: "chat.register" as const,
      inviteId: "inv-x",
      receiverEphemeralPublicKey: bobKey.publicKeyHex,
      replayId: "replay-x",
    };

    const sessionA = await SessionBootstrapAdapter.deriveSession({
      invite: handshake,
      acceptance: register,
      peerRole: "initiator",
      localPrivateKeyRef: aliceKey.privateKeyRef,
    });
    const sessionB = await SessionBootstrapAdapter.deriveSession({
      invite: handshake,
      acceptance: register,
      peerRole: "responder",
      localPrivateKeyRef: bobKey.privateKeyRef,
    });

    expect(sessionA.roomId).toBe("room-x");
    expect(sessionB.roomId).toBe("room-x");
    expect(sessionA.sessionId).toBe(sessionB.sessionId);

    const contract = await SessionBootstrapAdapter.buildHolepunchContract({
      session: sessionA,
      invite: handshake,
      peerRole: "initiator",
    });
    expect(contract.transport.kind).toBe("holepunch");
    expect(contract.transport.topicRef).toHaveLength(64);
    expect(contract.contractVersion).toBe(1);
  });

  it("does not mark connected with zero peers", async () => {
    __setHolepunchSidecarBackend(createMemorySidecarBackend());
    __setHolepunchConnectTimeoutMs(200);
    const { handshake, session, contract } = await buildContract(
      "room-solo",
      "inv-solo",
    );

    await HolepunchChatTransport.createRoom({
      contactId: "c1",
      bootstrap: {
        roomId: "room-solo",
        roomKeyRef: session.sessionId,
        bootstrapSource: "conceal-smart-message",
        lifecycleStatus: "accepted",
        inviteId: "inv-solo",
        roomTtl: handshake.roomTtl,
      },
    });

    const result = await HolepunchChatTransport.connect(contract);
    expect(result.lifecycleStatus).toBe("connect_failed");
    expect(result.lastConnectError).toBe("timeout");
    expect(canSendLiveMessages(result.lifecycleStatus)).toBe(false);
  });

  it("sends via L1 relay before connect, then live once Holepunch-connected", async () => {
    __setHolepunchSidecarBackend(createAutoPeerSidecarBackend());
    __setHolepunchSkipProof(true);
    const { handshake, session, contract } = await buildContract(
      "room-c",
      "inv-c",
    );

    await HolepunchChatTransport.createRoom({
      contactId: "c1",
      bootstrap: {
        roomId: "room-c",
        roomKeyRef: session.sessionId,
        bootstrapSource: "conceal-smart-message",
        lifecycleStatus: "accepted",
        inviteId: "inv-c",
        roomTtl: handshake.roomTtl,
      },
    });

    const pending = await HolepunchChatTransport.getRoom("room-c");
    expect(canSendLiveMessages(pending!.lifecycleStatus)).toBe(false);

    // Eligible contact ("c1") is accepted but not yet Holepunch-connected —
    // send must still succeed via L1 relay (grey bubble), never rejected.
    const relaySpy = vi
      .spyOn(ConcealSmartMessageAdapter, "sendChatRelay")
      .mockResolvedValue({ txHash: "relay-tx-c" });
    const relayMsg = await HolepunchChatTransport.sendMessage("room-c", "hi");
    expect(relayMsg.channel).toBe("relay");
    expect(relayMsg.status).toBe("delivered");
    expect(relaySpy).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: "c1" }),
    );

    const connected = await HolepunchChatTransport.connect(contract);
    expect(connected.lifecycleStatus).toBe("connected");
    const msg = await HolepunchChatTransport.sendMessage("room-c", "hello");
    expect(msg.text).toBe("hello");
    expect(msg.kind).toBe("text");
    expect(msg.channel).toBe("live");

    relaySpy.mockRestore();
  });

  it("seals and opens content with ChaCha20-Poly1305", async () => {
    const a = await P2PEncryptionAdapter.generateEphemeralKeypair();
    const b = await P2PEncryptionAdapter.generateEphemeralKeypair();
    const session = await P2PEncryptionAdapter.deriveSessionConfig({
      senderEphemeralPublicKey: a.publicKeyHex,
      receiverEphemeralPublicKey: b.publicKeyHex,
      localPrivateKeyRef: a.privateKeyRef,
      localIsSender: true,
      salt: "22".repeat(16),
      info: {
        protocolVersion: 1,
        cipherSuite: "CHACHA20_POLY1305_V1",
        relationshipId: "rel",
        roomId: "room",
      },
      nonceSeed: "33".repeat(16),
    });
    const a2 = await P2PEncryptionAdapter.generateEphemeralKeypair();
    const b2 = await P2PEncryptionAdapter.generateEphemeralKeypair();
    const sendSession = await P2PEncryptionAdapter.deriveSessionConfig({
      senderEphemeralPublicKey: a2.publicKeyHex,
      receiverEphemeralPublicKey: b2.publicKeyHex,
      localPrivateKeyRef: a2.privateKeyRef,
      localIsSender: true,
      salt: "22".repeat(16),
      info: {
        protocolVersion: 1,
        cipherSuite: "CHACHA20_POLY1305_V1",
        relationshipId: "rel",
        roomId: "room",
      },
      nonceSeed: "33".repeat(16),
    });
    const recvSession = await P2PEncryptionAdapter.deriveSessionConfig({
      senderEphemeralPublicKey: a2.publicKeyHex,
      receiverEphemeralPublicKey: b2.publicKeyHex,
      localPrivateKeyRef: b2.privateKeyRef,
      localIsSender: false,
      salt: "22".repeat(16),
      info: {
        protocolVersion: 1,
        cipherSuite: "CHACHA20_POLY1305_V1",
        relationshipId: "rel",
        roomId: "room",
      },
      nonceSeed: "33".repeat(16),
    });

    const sealed = await P2PEncryptionAdapter.seal({
      session: sendSession,
      plaintext: new TextEncoder().encode("ping"),
      aad: new TextEncoder().encode(`v1|room|${sendSession.sessionId}`),
    });
    const opened = await P2PEncryptionAdapter.open({
      session: recvSession,
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      aad: new TextEncoder().encode(`v1|room|${recvSession.sessionId}`),
    });
    expect(sendSession.sessionId).toBe(recvSession.sessionId);
    expect(opened).not.toBeNull();
    expect(new TextDecoder().decode(opened!.plaintext)).toBe("ping");
    expect(session.sessionId).toBeTruthy();
  });
});
