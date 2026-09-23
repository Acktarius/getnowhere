import { describe, expect, it } from "vitest";
import {
  P2PEncryptionAdapter,
  RECV_NONCE_WINDOW,
} from "@/services/p2p/P2PEncryptionAdapter";
import type { P2PSessionConfig } from "@/types/protocol";

async function pair(): Promise<{
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
    topicSuite: "SHA256_V1" as const,
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

async function sealText(session: P2PSessionConfig, text: string) {
  return P2PEncryptionAdapter.seal({
    session,
    plaintext: new TextEncoder().encode(text),
    aad: new TextEncoder().encode("v1|room|sid"),
  });
}

describe("receive counter window", () => {
  it("rejects a replay and leaves recvCounter on the opened frame", async () => {
    const { send, recv } = await pair();
    const sealed = await sealText(send, "one");
    const opened = await P2PEncryptionAdapter.open({
      session: recv,
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      aad: new TextEncoder().encode("v1|room|sid"),
    });
    expect(opened?.session.recvCounter).toBe(1);
    const replay = await P2PEncryptionAdapter.open({
      session: opened!.session,
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      aad: new TextEncoder().encode("v1|room|sid"),
    });
    expect(replay).toBeNull();
  });

  it("accepts a gap inside the window and jumps recvCounter", async () => {
    let { send, recv } = await pair();
    const frames = [];
    for (const text of ["a", "b", "c"]) {
      const sealed = await sealText(send, text);
      send = sealed.session;
      frames.push(sealed);
    }
    const opened = await P2PEncryptionAdapter.open({
      session: recv,
      ciphertext: frames[2].ciphertext,
      nonce: frames[2].nonce,
      aad: new TextEncoder().encode("v1|room|sid"),
    });
    expect(new TextDecoder().decode(opened?.plaintext)).toBe("c");
    expect(opened?.session.recvCounter).toBe(3);
    const late = await P2PEncryptionAdapter.open({
      session: opened!.session,
      ciphertext: frames[0].ciphertext,
      nonce: frames[0].nonce,
      aad: new TextEncoder().encode("v1|room|sid"),
    });
    expect(late).toBeNull();
  });

  it("rejects a gap at the window edge without moving recvCounter", async () => {
    let { send, recv } = await pair();
    let sealed = await sealText(send, "edge");
    for (let i = 0; i < RECV_NONCE_WINDOW; i++) {
      send = sealed.session;
      sealed = await sealText(send, "edge");
    }
    const opened = await P2PEncryptionAdapter.open({
      session: recv,
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      aad: new TextEncoder().encode("v1|room|sid"),
    });
    expect(opened).toBeNull();
    expect(recv.recvCounter).toBe(0);
  });

  it("rejects a wire nonce that is not the peer send nonce", async () => {
    const { send, recv } = await pair();
    const sealed = await sealText(send, "one");
    const forged = new Uint8Array(12);
    const opened = await P2PEncryptionAdapter.open({
      session: recv,
      ciphertext: sealed.ciphertext,
      nonce: forged,
      aad: new TextEncoder().encode("v1|room|sid"),
    });
    expect(opened).toBeNull();
  });
});
