/**
 * P2PEncryptionService — X25519 ECDH + HKDF-SHA256 + IETF ChaCha20-Poly1305 (not XChaCha).
 * Nonce = HKDF iv XOR frame counter; open accepts any authentic counter >= recvCounter.
 * @see docs/security/encryption.md
 */

import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { liveFrameHeader } from "@/services/p2p/liveFrameCodec";
import { deriveTopicRefForSuite, randomHex } from "@/services/protocol/ids";
import type { P2PSessionConfig, TopicSuiteId } from "@/types/protocol";
import type { P2PEncryptionService } from "@/types/services";

const NONCE_BYTES = 12;
const COUNTER_OFFSET = 4;
const IV_SALT = new TextEncoder().encode("send");
const IV_INFO = new TextEncoder().encode("iv");

const privateKeys = new Map<string, Uint8Array>();

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : `0${hex}`;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function encodeInfo(info: {
  protocolVersion: number;
  cipherSuite: string;
  relationshipId: string;
  roomId: string;
}): Uint8Array {
  return new TextEncoder().encode(
    `${info.protocolVersion}|${info.cipherSuite}|${info.relationshipId}|${info.roomId}`,
  );
}

/** `iv XOR (0x00000000 || counter u64 BE)`; injective in `counter`. */
export function deriveFrameNonce(
  nonceSeed: string,
  counter: number,
): Uint8Array {
  const nonce = hkdf(
    sha256,
    hexToBytes(nonceSeed),
    IV_SALT,
    IV_INFO,
    NONCE_BYTES,
  );
  const counterBytes = new Uint8Array(NONCE_BYTES - COUNTER_OFFSET);
  new DataView(counterBytes.buffer).setBigUint64(0, BigInt(counter), false);
  for (let i = 0; i < counterBytes.length; i++) {
    nonce[COUNTER_OFFSET + i] ^= counterBytes[i];
  }
  return nonce;
}

function frameAad(aad: Uint8Array | undefined, counter: number): Uint8Array {
  const base = aad ?? new Uint8Array(0);
  const header = liveFrameHeader(counter);
  const out = new Uint8Array(base.length + header.length);
  out.set(base, 0);
  out.set(header, base.length);
  return out;
}

function isSealableCounter(counter: number): boolean {
  return (
    Number.isSafeInteger(counter) &&
    counter >= 0 &&
    counter < Number.MAX_SAFE_INTEGER
  );
}

function isOpenableCounter(counter: number, recvCounter: number): boolean {
  return (
    Number.isSafeInteger(counter) && counter >= 0 && counter >= recvCounter
  );
}

export function wipePrivateKey(ref: string): void {
  const key = privateKeys.get(ref);
  if (key) {
    key.fill(0);
    privateKeys.delete(ref);
  }
}

/** Hex export for room-session persistence across reloads. */
export function exportKeyHex(ref: string): string | null {
  const key = privateKeys.get(ref);
  if (!key) return null;
  return bytesToHex(key);
}

/** Re-inject a persisted AEAD key under the contract's original ref. */
export function importKeyHex(ref: string, hex: string): void {
  const key = hexToBytes(hex);
  if (key.length !== 32) {
    throw new Error("Session key must be 32 bytes.");
  }
  privateKeys.set(ref, key);
}

export const P2PEncryptionAdapter: P2PEncryptionService = {
  async generateEphemeralKeypair() {
    const privateKey = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(privateKey);
    const privateKeyRef = `eph:${randomHex(16)}`;
    privateKeys.set(privateKeyRef, privateKey);
    return {
      publicKeyHex: bytesToHex(publicKey),
      privateKeyRef,
      privateKeyHex: bytesToHex(privateKey),
    };
  },

  async restoreEphemeralPrivateKey(privateKeyHex: string) {
    const privateKey = hexToBytes(privateKeyHex);
    if (privateKey.length !== 32) {
      throw new Error("Ephemeral private key must be 32 bytes.");
    }
    const privateKeyRef = `eph:${randomHex(16)}`;
    privateKeys.set(privateKeyRef, privateKey);
    return { privateKeyRef };
  },

  async deriveSessionConfig(input) {
    const localPriv = privateKeys.get(input.localPrivateKeyRef);
    if (!localPriv) {
      throw new Error("Unknown ephemeral private key ref.");
    }
    const remotePub = hexToBytes(
      input.localIsSender
        ? input.receiverEphemeralPublicKey
        : input.senderEphemeralPublicKey,
    );
    const shared = x25519.getSharedSecret(localPriv, remotePub);
    const topicSuite: TopicSuiteId = input.topicSuite ?? "SHA256_V1";
    const topicEpoch = input.topicEpoch ?? 0;
    const topicRef = await deriveTopicRefForSuite({
      suite: topicSuite,
      roomId: input.info.roomId,
      relationshipId: input.info.relationshipId,
      ecdhSharedSecret: shared,
      epoch: topicEpoch,
    });
    const okm = hkdf(
      sha256,
      shared,
      hexToBytes(input.salt),
      encodeInfo(input.info),
      64,
    );
    const sendKey = input.localIsSender ? okm.slice(0, 32) : okm.slice(32, 64);
    const recvKey = input.localIsSender ? okm.slice(32, 64) : okm.slice(0, 32);
    // Must be identical on both peers — AAD for proof/chat includes sessionId.
    const sessionId = bytesToHex(
      hkdf(
        sha256,
        okm,
        new TextEncoder().encode("gnh-session-id-v1"),
        encodeInfo(input.info),
        16,
      ),
    );
    const sendKeyRef = `sk:${randomHex(12)}`;
    const recvKeyRef = `rk:${randomHex(12)}`;
    // Store derived keys in the same map for seal/open
    privateKeys.set(sendKeyRef, sendKey);
    privateKeys.set(recvKeyRef, recvKey);
    wipePrivateKey(input.localPrivateKeyRef);

    return {
      sessionId,
      roomId: input.info.roomId,
      relationshipId: input.info.relationshipId,
      cipherSuite: input.info.cipherSuite,
      topicSuite,
      topicEpoch,
      topicRef,
      sendKeyRef,
      recvKeyRef,
      nonceSeed: input.nonceSeed,
      nonceStrategy: "counter_from_seed",
      sendCounter: 0,
      recvCounter: 0,
      createdAt: new Date().toISOString(),
    } satisfies P2PSessionConfig;
  },

  async seal({ session, plaintext, aad }) {
    const key = privateKeys.get(session.sendKeyRef);
    if (!key) throw new Error("Missing send key.");
    const counter = session.sendCounter;
    if (!isSealableCounter(counter)) {
      throw new Error("Send counter exhausted or invalid.");
    }
    const nonce = deriveFrameNonce(session.nonceSeed, counter);
    const aead = chacha20poly1305(key, nonce, frameAad(aad, counter));
    const ciphertext = aead.encrypt(plaintext);
    return {
      ciphertext,
      counter,
      session: { ...session, sendCounter: counter + 1 },
    };
  },

  async open({ session, counter, ciphertext, aad }) {
    const key = privateKeys.get(session.recvKeyRef);
    if (!key || !isOpenableCounter(counter, session.recvCounter)) return null;
    // Peer sealed under its "send" nonce; rebuild it from the wire counter.
    const nonce = deriveFrameNonce(session.nonceSeed, counter);
    try {
      const aead = chacha20poly1305(key, nonce, frameAad(aad, counter));
      const plaintext = aead.decrypt(ciphertext);
      return {
        plaintext,
        session: { ...session, recvCounter: counter + 1 },
      };
    } catch {
      return null;
    }
  },
};

/** Test helper: inject a raw key under a ref. */
export function __setKeyForTests(ref: string, key: Uint8Array): void {
  privateKeys.set(ref, key);
}
