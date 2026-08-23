import { MAX_MESSAGE_BODY_BYTES } from "conceal-wallet-sdk";
import { describe, expect, it } from "vitest";
import {
  encodeCreateSmartBody,
  encodeRegisterSmartBody,
  MAX_CREATE_BODY_CHARS,
  parseChatSmartBody,
} from "../../src/services/protocol/SmartMessageProtocolAdapter";
import type {
  ChatInviteHandshake,
  ChatRegisterPayload,
} from "../../src/types/protocol";

const VALID_POKE_HANDLE = "aB3dEfGhIjKlMn"; // 14 base64url chars

function sampleHandshake(
  overrides: Partial<ChatInviteHandshake> = {},
): ChatInviteHandshake {
  const now = Math.floor(Date.now() / 1000);
  return {
    protocolVersion: 1,
    inviteId: "aabbccdd",
    relationshipId: "bb".repeat(32),
    roomId: "11223344",
    cipherSuite: "CHACHA20_POLY1305_V1",
    senderEphemeralPublicKey: "11".repeat(32),
    kdf: "HKDF_SHA256_V1",
    nonceSeed: "22".repeat(8),
    nonceStrategy: "counter_from_seed",
    salt: "33".repeat(16),
    inviteExpiry: now + 3600,
    roomTtl: now + 86400,
    replayId: "44".repeat(8),
    roomTopic: "general",
    ...overrides,
  };
}

function sampleRegister(
  overrides: Partial<ChatRegisterPayload> = {},
): ChatRegisterPayload {
  return {
    type: "chat.register",
    inviteId: "aabbccdd",
    receiverEphemeralPublicKey: "55".repeat(32),
    replayId: "44".repeat(8),
    ...overrides,
  };
}

// ── chat.create ph field ──────────────────────────────────────────────────

describe("chat.create ph field encode/decode", () => {
  it("round-trips without ph — senderPokeHandle is undefined", () => {
    const hs = sampleHandshake();
    const body = encodeCreateSmartBody(hs);
    const parsed = parseChatSmartBody(body, {
      allowSeenReplay: true,
      allowExpiredInvite: true,
    });
    expect(parsed?.action).toBe("create");
    if (parsed?.action !== "create") throw new Error("expected create");
    expect(parsed.payload.senderPokeHandle).toBeUndefined();
  });

  it("round-trips with ph — senderPokeHandle matches", () => {
    const hs = sampleHandshake();
    const body = encodeCreateSmartBody(
      hs,
      undefined,
      undefined,
      VALID_POKE_HANDLE,
    );
    const parsed = parseChatSmartBody(body, {
      allowSeenReplay: true,
      allowExpiredInvite: true,
    });
    expect(parsed?.action).toBe("create");
    if (parsed?.action !== "create") throw new Error("expected create");
    expect(parsed.payload.senderPokeHandle).toBe(VALID_POKE_HANDLE);
  });

  it("body with ph still fits within MAX_CREATE_BODY_CHARS byte budget", () => {
    const hs = sampleHandshake();
    const body = encodeCreateSmartBody(
      hs,
      undefined,
      undefined,
      VALID_POKE_HANDLE,
    );
    const byteLen = new TextEncoder().encode(body).length;
    expect(byteLen).toBeLessThanOrEqual(MAX_CREATE_BODY_CHARS);
    expect(byteLen).toBeLessThanOrEqual(MAX_MESSAGE_BODY_BYTES);
  });

  it("ignores ph with wrong length (15 chars) — treated as undefined", () => {
    const hs = sampleHandshake();
    // Build a body manually with a 15-char ph to simulate a malformed peer
    const validBody = encodeCreateSmartBody(
      hs,
      undefined,
      undefined,
      VALID_POKE_HANDLE,
    );
    // Replace the handle in the raw body string with one of wrong length
    const badHandleBody = validBody.replace(
      VALID_POKE_HANDLE,
      "aB3dEfGhIjKlMnO",
    ); // 15 chars
    const parsed = parseChatSmartBody(badHandleBody, {
      allowSeenReplay: true,
      allowExpiredInvite: true,
    });
    // Parser should still produce a valid create but with senderPokeHandle undefined
    if (parsed?.action === "create") {
      expect(parsed.payload.senderPokeHandle).toBeUndefined();
    }
    // Parsing may also fail entirely — both outcomes are safe
  });

  it("2-field packed body (old peer, no ph) decodes without crash", () => {
    // Older clients encode without ph; parser must accept data.length === 2
    const hs = sampleHandshake();
    const oldBody = encodeCreateSmartBody(hs); // no ph → 2 fields: pv + pack
    expect(oldBody).not.toContain(VALID_POKE_HANDLE);
    const parsed = parseChatSmartBody(oldBody, {
      allowSeenReplay: true,
      allowExpiredInvite: true,
    });
    expect(parsed?.action).toBe("create");
    if (parsed?.action !== "create") throw new Error("expected create");
    expect(parsed.payload.senderPokeHandle).toBeUndefined();
    expect(parsed.payload.handshake.inviteId).toBe("aabbccdd");
  });
});

// ── chat.register ph field ────────────────────────────────────────────────

describe("chat.register ph field encode/decode", () => {
  it("round-trips without ph — pokeHandle is undefined", () => {
    const reg = sampleRegister();
    const body = encodeRegisterSmartBody(reg);
    const parsed = parseChatSmartBody(body, { allowSeenReplay: true });
    expect(parsed?.action).toBe("register");
    if (parsed?.action !== "register") throw new Error("expected register");
    expect(parsed.payload.pokeHandle).toBeUndefined();
  });

  it("round-trips with ph — pokeHandle matches", () => {
    const reg = sampleRegister({ pokeHandle: VALID_POKE_HANDLE });
    const body = encodeRegisterSmartBody(reg);
    const parsed = parseChatSmartBody(body, { allowSeenReplay: true });
    expect(parsed?.action).toBe("register");
    if (parsed?.action !== "register") throw new Error("expected register");
    expect(parsed.payload.pokeHandle).toBe(VALID_POKE_HANDLE);
    expect(parsed.payload.inviteId).toBe("aabbccdd");
  });

  it("register body with ph fits within MAX_MESSAGE_BODY_BYTES", () => {
    const reg = sampleRegister({ pokeHandle: VALID_POKE_HANDLE });
    const body = encodeRegisterSmartBody(reg);
    expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(
      MAX_MESSAGE_BODY_BYTES,
    );
  });

  it("register body without ph still round-trips correctly (backward compat)", () => {
    const reg = sampleRegister();
    const body = encodeRegisterSmartBody(reg);
    const parsed = parseChatSmartBody(body, { allowSeenReplay: true });
    expect(parsed?.action).toBe("register");
    if (parsed?.action !== "register") throw new Error("expected register");
    expect(parsed.payload.receiverEphemeralPublicKey).toMatch(
      /^[0-9a-f]{64}$/i,
    );
  });
});
