import { beforeEach, describe, expect, it } from "vitest";
import { P2PEncryptionAdapter } from "@/services/p2p/P2PEncryptionAdapter";
import {
  __clearRelationshipTopicEpochsForTests,
  setRelationshipTopicEpoch,
} from "@/services/p2p/relationshipTopicEpochStore";
import { SessionBootstrapAdapter } from "@/services/p2p/sessionBootstrap";
import type { ChatInviteHandshake } from "@/types/protocol";

function baseHandshake(
  overrides: Partial<ChatInviteHandshake> = {},
): ChatInviteHandshake {
  return {
    protocolVersion: 2,
    inviteId: "a1b2c3d4",
    relationshipId: "ab".repeat(32),
    roomId: "01020304",
    cipherSuite: "CHACHA20_POLY1305_V1",
    senderEphemeralPublicKey: "11".repeat(32),
    kdf: "HKDF_SHA256_V1",
    nonceSeed: "22".repeat(16),
    nonceStrategy: "counter_from_seed",
    salt: "33".repeat(16),
    inviteExpiry: 9_999_999_999,
    roomTtl: 9_999_999_999,
    replayId: "44".repeat(16),
    ...overrides,
  };
}

describe("SessionBootstrapAdapter v2 topicEpoch", () => {
  beforeEach(() => {
    __clearRelationshipTopicEpochsForTests();
  });

  it("uses relationship store when handshake omits topicEpoch", async () => {
    setRelationshipTopicEpoch("ab".repeat(32), 2);
    const alice = await P2PEncryptionAdapter.generateEphemeralKeypair();
    const bob = await P2PEncryptionAdapter.generateEphemeralKeypair();
    const invite = baseHandshake({
      senderEphemeralPublicKey: alice.publicKeyHex,
    });
    delete invite.topicEpoch;
    const session = await SessionBootstrapAdapter.deriveSession({
      invite,
      acceptance: {
        type: "chat.register",
        inviteId: invite.inviteId,
        receiverEphemeralPublicKey: bob.publicKeyHex,
        replayId: invite.replayId,
      },
      peerRole: "responder",
      localPrivateKeyRef: bob.privateKeyRef,
    });
    expect(session.topicEpoch).toBe(2);
    expect(session.topicSuite).toBe("HKDF_EPOCH_V1");
  });

  it("initiator and responder derive identical topicRef after epoch rotation", async () => {
    const rel = "cd".repeat(32);
    setRelationshipTopicEpoch(rel, 1);
    const alice = await P2PEncryptionAdapter.generateEphemeralKeypair();
    const bob = await P2PEncryptionAdapter.generateEphemeralKeypair();
    const invite = baseHandshake({
      relationshipId: rel,
      senderEphemeralPublicKey: alice.publicKeyHex,
      topicEpoch: 1,
    });
    const register = {
      type: "chat.register" as const,
      inviteId: invite.inviteId,
      receiverEphemeralPublicKey: bob.publicKeyHex,
      replayId: invite.replayId,
    };
    const aliceSession = await SessionBootstrapAdapter.deriveSession({
      invite,
      acceptance: register,
      peerRole: "initiator",
      localPrivateKeyRef: alice.privateKeyRef,
    });
    const bobSession = await SessionBootstrapAdapter.deriveSession({
      invite: { ...invite, topicEpoch: undefined },
      acceptance: register,
      peerRole: "responder",
      localPrivateKeyRef: bob.privateKeyRef,
    });
    expect(aliceSession.topicRef).toBe(bobSession.topicRef);
    expect(aliceSession.topicEpoch).toBe(1);
    expect(bobSession.topicEpoch).toBe(1);
  });
});
