import { describe, expect, it } from "vitest";
import {
  HOLEPUNCH_CONNECT_TIMEOUT_MS,
  holepunchBackoffMs,
  isRetryableConnectFailure,
} from "../../src/services/p2p/holepunchPolicy";
import { P2PEncryptionAdapter } from "../../src/services/p2p/P2PEncryptionAdapter";
import {
  assertCanSendLive,
  composerDisabledReason,
  isComposerEnabled,
} from "../../src/services/protocol/composerGate";
import { canSendLiveMessages } from "../../src/services/protocol/roomLifecycle";
import type { RoomLifecycleStatus } from "../../src/types/models";

describe("accepted vs connected composer gate", () => {
  const blocked: RoomLifecycleStatus[] = [
    "pending",
    "accepted",
    "connecting",
    "connect_failed",
    "declined",
    "expired",
    "failed",
    "closed",
    "destroyed",
  ];

  it("enables composer only when connected", () => {
    for (const status of blocked) {
      expect(isComposerEnabled(status)).toBe(false);
      expect(canSendLiveMessages(status)).toBe(false);
      expect(composerDisabledReason(status)).toBeTruthy();
      expect(() => assertCanSendLive(status)).toThrow();
    }
    expect(isComposerEnabled("connected")).toBe(true);
    expect(composerDisabledReason("connected")).toBeNull();
    expect(() => assertCanSendLive("connected")).not.toThrow();
  });

  it("documents that accepted is not connected", () => {
    expect(composerDisabledReason("accepted")).toMatch(/connecting/i);
    expect(isComposerEnabled("accepted")).toBe(false);
  });
});

describe("holepunch connect policy", () => {
  it("uses 30s timeout and exponential backoff with cap", () => {
    expect(HOLEPUNCH_CONNECT_TIMEOUT_MS).toBe(30_000);
    const a1 = holepunchBackoffMs(1);
    const a3 = holepunchBackoffMs(3);
    expect(a1).toBeGreaterThanOrEqual(1000);
    expect(a1).toBeLessThan(1000 + 250);
    expect(a3).toBeGreaterThanOrEqual(4000);
    expect(holepunchBackoffMs(20)).toBeLessThanOrEqual(60_000 + 250);
  });

  it("classifies retryable failures", () => {
    expect(isRetryableConnectFailure("timeout")).toBe(true);
    expect(isRetryableConnectFailure("crypto_mismatch")).toBe(false);
  });
});

describe("nonce uniqueness under ChaCha20-Poly1305", () => {
  it("increments sendCounter and produces distinct nonces", async () => {
    const a = await P2PEncryptionAdapter.generateEphemeralKeypair();
    const b = await P2PEncryptionAdapter.generateEphemeralKeypair();
    let session = await P2PEncryptionAdapter.deriveSessionConfig({
      senderEphemeralPublicKey: a.publicKeyHex,
      receiverEphemeralPublicKey: b.publicKeyHex,
      localPrivateKeyRef: a.privateKeyRef,
      localIsSender: true,
      salt: "44".repeat(16),
      info: {
        protocolVersion: 1,
        cipherSuite: "CHACHA20_POLY1305_V1",
        relationshipId: "rel-n",
        roomId: "room-n",
      },
      nonceSeed: "55".repeat(16),
    });

    const s1 = await P2PEncryptionAdapter.seal({
      session,
      plaintext: new TextEncoder().encode("one"),
    });
    session = s1.session;
    const s2 = await P2PEncryptionAdapter.seal({
      session,
      plaintext: new TextEncoder().encode("two"),
    });

    expect(s1.nonce.length).toBe(12);
    expect(s2.nonce.length).toBe(12);
    expect([...s1.nonce].join(",")).not.toBe([...s2.nonce].join(","));
    expect(s2.session.sendCounter).toBe(s1.session.sendCounter + 1);
  });
});
