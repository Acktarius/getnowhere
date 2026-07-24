import { describe, expect, it } from "vitest";
import {
  HOLEPUNCH_CONNECT_TIMEOUT_MS,
  holepunchBackoffMs,
  isRetryableConnectFailure,
} from "../../src/services/p2p/holepunchPolicy";
import { P2PEncryptionAdapter } from "../../src/services/p2p/P2PEncryptionAdapter";
import {
  assertCanSendLive,
  assertCanSendMessages,
  canComposeMessages,
  composerDisabledReason,
  composerPreferredChannel,
  isComposerEnabled,
} from "../../src/services/protocol/composerGate";
import {
  canSendLiveMessages,
  canSendMessages,
  isRelayEligibleStatus,
  preferredChannel,
} from "../../src/services/protocol/roomLifecycle";
import type { RoomLifecycleStatus } from "../../src/types/models";

describe("accepted vs connected composer gate", () => {
  it("enables live composer only when connected", () => {
    expect(isComposerEnabled("accepted")).toBe(false);
    expect(canSendLiveMessages("accepted")).toBe(false);
    expect(() => assertCanSendLive("accepted")).toThrow();
    expect(isComposerEnabled("connected")).toBe(true);
    expect(composerDisabledReason("connected")).toBeNull();
    expect(() => assertCanSendLive("connected")).not.toThrow();
  });

  it("allows relay after accept without session keys; blocks pending", () => {
    for (const status of [
      "accepted",
      "connecting",
      "connect_failed",
    ] as const) {
      expect(isRelayEligibleStatus(status)).toBe(true);
      expect(canComposeMessages(status)).toBe(true);
      expect(canSendMessages(status)).toBe(true);
      expect(preferredChannel(status)).toBe("relay");
      expect(composerPreferredChannel(status)).toBe("relay");
      expect(() => assertCanSendMessages(status)).not.toThrow();
      expect(composerDisabledReason(status)).toBeNull();
    }
    expect(canComposeMessages("pending")).toBe(false);
    expect(isRelayEligibleStatus("pending")).toBe(false);
    expect(() => assertCanSendMessages("pending")).toThrow();
    expect(composerDisabledReason("pending")).toMatch(/accept/i);
  });

  it("prefers live when connected", () => {
    expect(preferredChannel("connected")).toBe("live");
    expect(composerPreferredChannel("connected")).toBe("live");
    expect(canComposeMessages("connected")).toBe(true);
  });

  it("surfaces connect_failed codes when composer blocked for other reasons", () => {
    const blocked: RoomLifecycleStatus[] = ["declined", "expired", "destroyed"];
    for (const status of blocked) {
      expect(canComposeMessages(status)).toBe(false);
    }
    // connect_failed itself is relay-eligible
    expect(canComposeMessages("connect_failed")).toBe(true);
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
