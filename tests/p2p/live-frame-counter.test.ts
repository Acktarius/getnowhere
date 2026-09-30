import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { describe, expect, it } from "vitest";
import { liveFrameHeader } from "@/services/p2p/liveFrameCodec";
import {
  __setKeyForTests,
  deriveFrameNonce,
  P2PEncryptionAdapter,
} from "@/services/p2p/P2PEncryptionAdapter";
import type { P2PSessionConfig } from "@/types/protocol";

const AAD = new TextEncoder().encode("v1|room|sid");

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
    aad: AAD,
  });
}

/** Seals `count` frames in order and returns them with the final send session. */
async function sealMany(session: P2PSessionConfig, count: number) {
  let current = session;
  const frames = [];
  for (let i = 0; i < count; i++) {
    const sealed = await sealText(current, `m${i}`);
    current = sealed.session;
    frames.push(sealed);
  }
  return frames;
}

function openFrame(
  session: P2PSessionConfig,
  frame: { ciphertext: Uint8Array; counter: number },
  aad: Uint8Array = AAD,
) {
  return P2PEncryptionAdapter.open({
    session,
    ciphertext: frame.ciphertext,
    counter: frame.counter,
    aad,
  });
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

describe("live frame counter seal/open", () => {
  it("seal returns the pre-increment counter and advances sendCounter", async () => {
    const { send } = await pair();
    const first = await sealText(send, "a");
    const second = await sealText(first.session, "b");
    expect(first.counter).toBe(send.sendCounter);
    expect(first.session.sendCounter).toBe(send.sendCounter + 1);
    expect(second.counter).toBe(first.session.sendCounter);
  });

  for (const gap of [0, 63, 64, 1000]) {
    it(`opens the last frame after a gap of ${gap} and resyncs recvCounter`, async () => {
      const { send, recv } = await pair();
      const frames = await sealMany(send, gap + 1);
      const last = frames[frames.length - 1];
      const opened = await openFrame(recv, last);
      expect(new TextDecoder().decode(opened?.plaintext)).toBe(`m${gap}`);
      expect(opened?.session.recvCounter).toBe(last.counter + 1);
    });
  }

  it("rejects a replay of an accepted frame", async () => {
    const { send, recv } = await pair();
    const [frame] = await sealMany(send, 1);
    const opened = await openFrame(recv, frame);
    expect(opened).not.toBeNull();
    const accepted = opened!.session;
    const replay = await openFrame(accepted, frame);
    expect(replay).toBeNull();
    expect(accepted.recvCounter).toBe(frame.counter + 1);
  });

  it("drops a lower counter after a higher one was accepted", async () => {
    const { send, recv } = await pair();
    const frames = await sealMany(send, 3);
    const opened = await openFrame(recv, frames[2]);
    const accepted = opened!.session;
    const stale = await openFrame(accepted, frames[1]);
    expect(stale).toBeNull();
    expect(accepted.recvCounter).toBe(frames[2].counter + 1);
  });

  it("rejects a genuine ciphertext under a tampered counter", async () => {
    const { send, recv } = await pair();
    const frames = await sealMany(send, 2);
    const genuine = frames[1];
    const up = await openFrame(recv, {
      ...genuine,
      counter: genuine.counter + 1,
    });
    const down = await openFrame(recv, {
      ...genuine,
      counter: genuine.counter - 1,
    });
    expect(up).toBeNull();
    expect(down).toBeNull();
    expect(recv.recvCounter).toBe(0);
  });

  it("rejects a frame opened with the wrong AAD", async () => {
    const { send, recv } = await pair();
    const [frame] = await sealMany(send, 1);
    const opened = await openFrame(
      recv,
      frame,
      new TextEncoder().encode("v1|room|other"),
    );
    expect(opened).toBeNull();
  });

  it("derives pairwise distinct nonces for counters 0..10000", () => {
    const seed = "33".repeat(8);
    const count = 10_001;
    const nonces = new Set<string>();
    for (let counter = 0; counter < count; counter++) {
      nonces.add(toHex(deriveFrameNonce(seed, counter)));
    }
    expect(nonces.size).toBe(count);
  });

  it("refuses to seal at Number.MAX_SAFE_INTEGER", async () => {
    const { send } = await pair();
    await expect(
      sealText({ ...send, sendCounter: Number.MAX_SAFE_INTEGER }, "x"),
    ).rejects.toThrow();
  });

  it("refuses to seal with a non-integer sendCounter", async () => {
    const { send } = await pair();
    await expect(
      sealText({ ...send, sendCounter: 1.5 }, "x"),
    ).rejects.toThrow();
  });

  it("returns null for an unsafe or negative counter", async () => {
    const { send, recv } = await pair();
    const [frame] = await sealMany(send, 1);
    for (const counter of [-1, Number.MAX_SAFE_INTEGER + 1, 0.5]) {
      await expect(openFrame(recv, { ...frame, counter })).resolves.toBeNull();
    }
  });

  it("binds the frame header into the AAD", async () => {
    const { send } = await pair();
    const key = new Uint8Array(32).fill(7);
    __setKeyForTests(send.sendKeyRef, key);
    const sealed = await sealText(send, "bound");
    const nonce = deriveFrameNonce(send.nonceSeed, sealed.counter);
    const withHeader = concat(AAD, liveFrameHeader(sealed.counter));
    const plain = chacha20poly1305(key, nonce, withHeader).decrypt(
      sealed.ciphertext,
    );
    expect(new TextDecoder().decode(plain)).toBe("bound");
    expect(() =>
      chacha20poly1305(key, nonce, AAD).decrypt(sealed.ciphertext),
    ).toThrow();
  });
});
