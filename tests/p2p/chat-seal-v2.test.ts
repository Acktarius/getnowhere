import { describe, expect, it } from "vitest";
import { P2PEncryptionAdapter } from "@/services/p2p/P2PEncryptionAdapter";
import { buildChatAad, buildProofAad } from "@/services/protocol/proofAad";
import type { P2PSessionConfig } from "@/types/protocol";

async function v2Pair(): Promise<{
  send: P2PSessionConfig;
  recv: P2PSessionConfig;
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
  const send = await P2PEncryptionAdapter.deriveSessionConfig({
    ...base,
    localPrivateKeyRef: alice.privateKeyRef,
    localIsSender: true,
  });
  const recv = await P2PEncryptionAdapter.deriveSessionConfig({
    ...base,
    localPrivateKeyRef: bob.privateKeyRef,
    localIsSender: false,
  });
  return { send, recv };
}

describe("v2 live chat AEAD", () => {
  it("chat uses v1 AAD; proof uses v2 AAD", async () => {
    const { send } = await v2Pair();
    const roomId = send.roomId;
    expect(new TextDecoder().decode(buildChatAad(roomId, send))).toBe(
      `v1|${roomId}|${send.sessionId}`,
    );
    expect(new TextDecoder().decode(buildProofAad(roomId, send))).toContain(
      "HKDF_EPOCH_V1",
    );
  });

  it("chat frame sealed with chat AAD opens on peer", async () => {
    const { send, recv } = await v2Pair();
    const roomId = send.roomId;
    const plaintext = new TextEncoder().encode(
      JSON.stringify({
        schemaVersion: 1,
        messageId: "m1",
        kind: "text",
        text: "hello",
        sentAt: new Date().toISOString(),
      }),
    );
    const sealed = await P2PEncryptionAdapter.seal({
      session: send,
      plaintext,
      aad: buildChatAad(roomId, send),
    });
    const opened = await P2PEncryptionAdapter.open({
      session: recv,
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      aad: buildChatAad(roomId, recv),
    });
    expect(opened).not.toBeNull();
    expect(new TextDecoder().decode(opened!.plaintext)).toContain("hello");
  });

  it("chat frame fails open with proof AAD (regression)", async () => {
    const { send, recv } = await v2Pair();
    const roomId = send.roomId;
    const sealed = await P2PEncryptionAdapter.seal({
      session: send,
      plaintext: new TextEncoder().encode("hi"),
      aad: buildChatAad(roomId, send),
    });
    const opened = await P2PEncryptionAdapter.open({
      session: recv,
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      aad: buildProofAad(roomId, recv),
    });
    expect(opened).toBeNull();
  });
});
