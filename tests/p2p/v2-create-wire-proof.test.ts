import { beforeEach, describe, expect, it } from "vitest";
import { P2PEncryptionAdapter } from "@/services/p2p/P2PEncryptionAdapter";
import {
  __clearRelationshipTopicEpochsForTests,
  setRelationshipTopicEpoch,
} from "@/services/p2p/relationshipTopicEpochStore";
import { SessionBootstrapAdapter } from "@/services/p2p/sessionBootstrap";
import { deriveInviteSalt } from "@/services/protocol/ids";
import { buildProofAad } from "@/services/protocol/proofAad";
import {
  encodeCreateSmartBody,
  packCreateHandshake,
  unpackCreateHandshake,
} from "@/services/protocol/SmartMessageProtocolAdapter";
import type { ChatInviteHandshake } from "@/types/protocol";
import { CHAT_PROTOCOL_VERSION } from "@/types/protocol";

async function bobAliceSessionsFromWirePack(opts?: { topicEpoch?: number }) {
  const alice = await P2PEncryptionAdapter.generateEphemeralKeypair();
  const bob = await P2PEncryptionAdapter.generateEphemeralKeypair();
  const relationshipId = "ab".repeat(32);
  const roomId = "01020304";
  const inviteId = "a1b2c3d4";
  const topicEpoch = opts?.topicEpoch ?? 0;
  if (topicEpoch > 0) {
    setRelationshipTopicEpoch(relationshipId, topicEpoch);
  }
  const salt = await deriveInviteSalt(relationshipId, roomId, inviteId);
  const now = Math.floor(Date.now() / 1000);
  const handshake: ChatInviteHandshake = {
    protocolVersion: CHAT_PROTOCOL_VERSION,
    inviteId,
    relationshipId,
    roomId,
    topicEpoch,
    cipherSuite: "CHACHA20_POLY1305_V1",
    senderEphemeralPublicKey: alice.publicKeyHex,
    kdf: "HKDF_SHA256_V1",
    nonceSeed: "22".repeat(8),
    nonceStrategy: "counter_from_seed",
    salt,
    inviteExpiry: now + 3600,
    roomTtl: now + 86400,
    replayId: "44".repeat(8),
  };
  const body = encodeCreateSmartBody(handshake, "Bob", ["chat.v1"]);
  const parsed = unpackCreateHandshake(
    CHAT_PROTOCOL_VERSION,
    packCreateHandshake(handshake),
  );
  expect(parsed?.topicEpoch).toBe(topicEpoch);
  expect(body.length).toBeGreaterThan(0);

  const register = {
    type: "chat.register" as const,
    inviteId,
    receiverEphemeralPublicKey: bob.publicKeyHex,
    replayId: handshake.replayId,
  };

  const bobHydrated: ChatInviteHandshake = {
    ...parsed!,
    relationshipId,
    salt,
  };
  const aliceHydrated: ChatInviteHandshake = {
    ...parsed!,
    relationshipId,
    salt,
  };

  const bobSession = await SessionBootstrapAdapter.deriveSession({
    invite: bobHydrated,
    acceptance: register,
    peerRole: "initiator",
    localPrivateKeyRef: alice.privateKeyRef,
  });
  const aliceSession = await SessionBootstrapAdapter.deriveSession({
    invite: aliceHydrated,
    acceptance: register,
    peerRole: "responder",
    localPrivateKeyRef: bob.privateKeyRef,
  });
  return { bobSession, aliceSession, roomId, register };
}

describe("v2 create wire + proof", () => {
  beforeEach(() => {
    __clearRelationshipTopicEpochsForTests();
  });

  it("packs topicEpoch on wire for protocol v2", () => {
    const packed = packCreateHandshake({
      protocolVersion: 2,
      inviteId: "01020304",
      relationshipId: "aa",
      roomId: "05060708",
      cipherSuite: "CHACHA20_POLY1305_V1",
      senderEphemeralPublicKey: "11".repeat(32),
      kdf: "HKDF_SHA256_V1",
      nonceSeed: "22".repeat(8),
      nonceStrategy: "counter_from_seed",
      salt: "33".repeat(16),
      inviteExpiry: 1,
      roomTtl: 2,
      replayId: "44".repeat(8),
      topicEpoch: 3,
    });
    const hs = unpackCreateHandshake(2, packed);
    expect(hs?.topicEpoch).toBe(3);
  });

  it("initiator and responder match topicRef and exchange proof at epoch 0", async () => {
    const { bobSession, aliceSession, roomId } =
      await bobAliceSessionsFromWirePack();
    expect(bobSession.topicRef).toBe(aliceSession.topicRef);
    expect(bobSession.topicSuite).toBe("HKDF_EPOCH_V1");
    expect(aliceSession.topicEpoch).toBe(0);

    const sealed = await P2PEncryptionAdapter.seal({
      session: bobSession,
      plaintext: new TextEncoder().encode("proof:v1"),
      aad: buildProofAad(roomId, bobSession),
    });
    const opened = await P2PEncryptionAdapter.open({
      session: aliceSession,
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      aad: buildProofAad(roomId, aliceSession),
    });
    expect(opened).not.toBeNull();
  });

  it("initiator and responder match at rotated epoch", async () => {
    const { bobSession, aliceSession, roomId } =
      await bobAliceSessionsFromWirePack({ topicEpoch: 2 });
    expect(bobSession.topicEpoch).toBe(2);
    expect(aliceSession.topicEpoch).toBe(2);
    expect(bobSession.topicRef).toBe(aliceSession.topicRef);

    const sealed = await P2PEncryptionAdapter.seal({
      session: aliceSession,
      plaintext: new TextEncoder().encode("proof:v1"),
      aad: buildProofAad(roomId, aliceSession),
    });
    const opened = await P2PEncryptionAdapter.open({
      session: bobSession,
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      aad: buildProofAad(roomId, bobSession),
    });
    expect(opened).not.toBeNull();
  });
});
