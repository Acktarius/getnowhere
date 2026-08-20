import { x25519 } from "@noble/curves/ed25519.js";
import { describe, expect, it } from "vitest";
import {
  deriveKRelationship,
  deriveTopicRef,
  deriveTopicRefForSuite,
  deriveTopicRefV2,
  normalizeHexId,
} from "@/services/protocol/ids";

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("topic derivation v2", () => {
  it("v1 SHA256 topic unchanged", async () => {
    const roomId = "a1b2c3d4";
    const relationshipId = "e".repeat(64);
    const topic = await deriveTopicRef(roomId, relationshipId);
    expect(topic).toHaveLength(64);
    expect(topic).toMatch(/^[0-9a-f]{64}$/);
  });

  it("HKDF v2 is deterministic for same inputs", async () => {
    const alice = x25519.utils.randomSecretKey();
    const bob = x25519.utils.randomSecretKey();
    const sharedAlice = x25519.getSharedSecret(alice, x25519.getPublicKey(bob));
    const sharedBob = x25519.getSharedSecret(bob, x25519.getPublicKey(alice));
    expect(hex(sharedAlice)).toBe(hex(sharedBob));

    const relationshipId = "ab".repeat(32);
    const t0a = await deriveTopicRefV2(sharedAlice, relationshipId, 0);
    const t0b = await deriveTopicRefV2(sharedBob, relationshipId, 0);
    expect(t0a).toBe(t0b);
    expect(t0a).toHaveLength(64);
  });

  it("epoch bump changes topic", async () => {
    const alice = x25519.utils.randomSecretKey();
    const bob = x25519.utils.randomSecretKey();
    const shared = x25519.getSharedSecret(alice, x25519.getPublicKey(bob));
    const relationshipId = "cd".repeat(32);
    const e0 = await deriveTopicRefV2(shared, relationshipId, 0);
    const e1 = await deriveTopicRefV2(shared, relationshipId, 1);
    expect(e0).not.toBe(e1);
  });

  it("normalizeHexId applied to relationshipId salt", async () => {
    const alice = x25519.utils.randomSecretKey();
    const bob = x25519.utils.randomSecretKey();
    const shared = x25519.getSharedSecret(alice, x25519.getPublicKey(bob));
    const lower = "ab".repeat(32);
    const mixed = `${"AB".repeat(32)}`;
    expect(normalizeHexId(mixed)).toBe(lower);
    const tLower = await deriveTopicRefV2(shared, lower, 0);
    const tMixed = await deriveTopicRefV2(shared, mixed, 0);
    expect(tLower).toBe(tMixed);
  });

  it("deriveTopicRefForSuite dispatches v1 vs v2", async () => {
    const roomId = "01020304";
    const relationshipId = "ff".repeat(32);
    const v1 = await deriveTopicRefForSuite({
      suite: "SHA256_V1",
      roomId,
      relationshipId,
    });
    const alice = x25519.utils.randomSecretKey();
    const bob = x25519.utils.randomSecretKey();
    const shared = x25519.getSharedSecret(alice, x25519.getPublicKey(bob));
    const v2 = await deriveTopicRefForSuite({
      suite: "HKDF_EPOCH_V1",
      roomId,
      relationshipId,
      ecdhSharedSecret: shared,
      epoch: 0,
    });
    expect(v1).not.toBe(v2);
  });

  it("deriveKRelationship returns 32 bytes", async () => {
    const alice = x25519.utils.randomSecretKey();
    const bob = x25519.utils.randomSecretKey();
    const shared = x25519.getSharedSecret(alice, x25519.getPublicKey(bob));
    const k = await deriveKRelationship(shared, "aa".repeat(32));
    expect(k.length).toBe(32);
  });
});
