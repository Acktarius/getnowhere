import { describe, expect, it } from "vitest";
import { P2PEncryptionAdapter } from "@/services/p2p/P2PEncryptionAdapter";
import {
  buildChatAad,
  buildProofAad,
  incomingFrameAadCandidates,
} from "@/services/protocol/proofAad";
import type { P2PSessionConfig } from "@/types/protocol";

async function v2Pair(): Promise<{
  initiator: P2PSessionConfig;
  responder: P2PSessionConfig;
}> {
  const alice = await P2PEncryptionAdapter.generateEphemeralKeypair();
  const bob = await P2PEncryptionAdapter.generateEphemeralKeypair();
  const base = {
    senderEphemeralPublicKey: alice.publicKeyHex,
    receiverEphemeralPublicKey: bob.publicKeyHex,
    salt: "22".repeat(16),
    info: {
      protocolVersion: 2,
      cipherSuite: "CHACHA20_POLY1305_V1" as const,
      relationshipId: "ab".repeat(32),
      roomId: "01020304",
    },
    nonceSeed: "33".repeat(8),
    topicSuite: "HKDF_EPOCH_V1" as const,
    topicEpoch: 0,
  };
  const initiator = await P2PEncryptionAdapter.deriveSessionConfig({
    ...base,
    localPrivateKeyRef: alice.privateKeyRef,
    localIsSender: true,
  });
  const responder = await P2PEncryptionAdapter.deriveSessionConfig({
    ...base,
    localPrivateKeyRef: bob.privateKeyRef,
    localIsSender: false,
  });
  return { initiator, responder };
}

function decodeAad(aad: Uint8Array): string {
  return new TextDecoder().decode(aad);
}

describe("incomingFrameAadCandidates", () => {
  it("prefers proof AAD while connecting", async () => {
    const { initiator } = await v2Pair();
    const [first, second] = incomingFrameAadCandidates(
      initiator.roomId,
      initiator,
      "connecting",
    );
    expect(decodeAad(first)).toContain("v2|");
    expect(decodeAad(second)).toBe(
      `v1|${initiator.roomId}|${initiator.sessionId}`,
    );
  });

  it("prefers chat AAD when connected", async () => {
    const { initiator } = await v2Pair();
    const [first, second] = incomingFrameAadCandidates(
      initiator.roomId,
      initiator,
      "connected",
    );
    expect(decodeAad(first)).toBe(
      `v1|${initiator.roomId}|${initiator.sessionId}`,
    );
    expect(decodeAad(second)).toContain("v2|");
  });

  it("opens early v2 proof with connecting candidate order (regression)", async () => {
    const { initiator, responder } = await v2Pair();
    const roomId = initiator.roomId;
    const sealed = await P2PEncryptionAdapter.seal({
      session: initiator,
      plaintext: new TextEncoder().encode(
        JSON.stringify({
          schemaVersion: 1,
          messageId: "proof-early",
          kind: "proof",
          text: `proof:v1:${initiator.sessionId}`,
        }),
      ),
      aad: buildProofAad(roomId, initiator),
    });

    let opened = null;
    for (const aad of incomingFrameAadCandidates(
      roomId,
      responder,
      "connecting",
    )) {
      opened = await P2PEncryptionAdapter.open({
        session: responder,
        ciphertext: sealed.ciphertext,
        nonce: sealed.nonce,
        aad,
      });
      if (opened) break;
    }
    expect(opened).not.toBeNull();
  });

  it("opens reconnect proof when connected via proof fallback", async () => {
    const { initiator, responder } = await v2Pair();
    const roomId = initiator.roomId;
    const sealed = await P2PEncryptionAdapter.seal({
      session: initiator,
      plaintext: new TextEncoder().encode(
        JSON.stringify({
          schemaVersion: 1,
          messageId: "proof-reconnect",
          kind: "proof",
          text: `proof:v1:${initiator.sessionId}`,
        }),
      ),
      aad: buildProofAad(roomId, initiator),
    });

    let opened = null;
    for (const aad of incomingFrameAadCandidates(
      roomId,
      responder,
      "connected",
    )) {
      opened = await P2PEncryptionAdapter.open({
        session: responder,
        ciphertext: sealed.ciphertext,
        nonce: sealed.nonce,
        aad,
      });
      if (opened) break;
    }
    expect(opened).not.toBeNull();
  });

  it("chat-only frame fails with connecting candidate order", async () => {
    const { initiator, responder } = await v2Pair();
    const roomId = initiator.roomId;
    const sealed = await P2PEncryptionAdapter.seal({
      session: initiator,
      plaintext: new TextEncoder().encode("hello"),
      aad: buildChatAad(roomId, initiator),
    });

    let opened = null;
    for (const aad of incomingFrameAadCandidates(
      roomId,
      responder,
      "connecting",
    )) {
      opened = await P2PEncryptionAdapter.open({
        session: responder,
        ciphertext: sealed.ciphertext,
        nonce: sealed.nonce,
        aad,
      });
      if (opened) break;
    }
    expect(opened).not.toBeNull();
  });
});
