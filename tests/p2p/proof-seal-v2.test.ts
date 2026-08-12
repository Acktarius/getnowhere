import { describe, expect, it } from "vitest";
import { P2PEncryptionAdapter } from "@/services/p2p/P2PEncryptionAdapter";
import { buildProofAad } from "@/services/protocol/proofAad";
import type { P2PSessionConfig } from "@/types/protocol";

async function v2SessionPair(epoch: number): Promise<{
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
    nonceSeed: "33".repeat(16),
    topicSuite: "HKDF_EPOCH_V1" as const,
    topicEpoch: epoch,
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

describe("v2 post-connect proof AEAD", () => {
  it("matching epoch opens proof frame", async () => {
    const { send, recv } = await v2SessionPair(1);
    const roomId = send.roomId;
    const aad = buildProofAad(roomId, send);
    const sealed = await P2PEncryptionAdapter.seal({
      session: send,
      plaintext: new TextEncoder().encode("proof:v1"),
      aad,
    });
    const opened = await P2PEncryptionAdapter.open({
      session: recv,
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      aad: buildProofAad(roomId, recv),
    });
    expect(opened).not.toBeNull();
  });

  it("wrong epoch AAD fails open (crypto_mismatch path)", async () => {
    const { send, recv } = await v2SessionPair(1);
    const roomId = send.roomId;
    const sealed = await P2PEncryptionAdapter.seal({
      session: send,
      plaintext: new TextEncoder().encode("proof:v1"),
      aad: buildProofAad(roomId, send),
    });
    const wrongEpochRecv: P2PSessionConfig = { ...recv, topicEpoch: 0 };
    const opened = await P2PEncryptionAdapter.open({
      session: wrongEpochRecv,
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      aad: buildProofAad(roomId, wrongEpochRecv),
    });
    expect(opened).toBeNull();
  });
});
