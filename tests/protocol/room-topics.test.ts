import { describe, expect, it } from "vitest";
import {
  packCreateHandshake,
  unpackCreateHandshake,
} from "../../src/services/protocol/SmartMessageProtocolAdapter";
import { CHAT_PROTOCOL_VERSION } from "../../src/types/protocol";
import type { ChatInviteHandshake } from "../../src/types/protocol";

function sample(topic: ChatInviteHandshake["roomTopic"]): ChatInviteHandshake {
  return {
    protocolVersion: CHAT_PROTOCOL_VERSION,
    inviteId: "aabbccdd",
    relationshipId: "11".repeat(16),
    roomId: "11223344",
    cipherSuite: "CHACHA20_POLY1305_V1",
    senderEphemeralPublicKey: "22".repeat(32),
    kdf: "HKDF_SHA256_V1",
    nonceSeed: "33".repeat(8),
    nonceStrategy: "counter_from_seed",
    salt: "44".repeat(16),
    inviteExpiry: 1_900_000_000,
    roomTtl: 1_900_086_400,
    replayId: "55".repeat(8),
    roomTopic: topic,
  };
}

describe("room topic on create pack", () => {
  it("round-trips vacation topic", () => {
    const packed = packCreateHandshake(sample("vacation"));
    const hs = unpackCreateHandshake(CHAT_PROTOCOL_VERSION, packed);
    expect(hs?.roomId).toBe("11223344");
    expect(hs?.roomTopic).toBe("vacation");
  });

  it("defaults missing topic byte to general (legacy slim)", () => {
    const packed = packCreateHandshake(sample("work"));
    // Strip last byte of decoded pack by re-packing without topic — use unpack on V1 length via manual.
    const { b64urlToBytes, bytesToB64url } = (() => {
      // local helpers mirror adapter
      function b64urlToBytes(value: string): Uint8Array {
        const padded = value.replace(/-/g, "+").replace(/_/g, "/");
        const padLen = (4 - (padded.length % 4)) % 4;
        const b64 = padded + "=".repeat(padLen);
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
      }
      function bytesToB64url(bytes: Uint8Array): string {
        let bin = "";
        for (const b of bytes) bin += String.fromCharCode(b);
        return btoa(bin)
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
      }
      return { b64urlToBytes, bytesToB64url };
    })();
    const full = b64urlToBytes(packed);
    const legacy = bytesToB64url(full.subarray(0, 64));
    const hs = unpackCreateHandshake(CHAT_PROTOCOL_VERSION, legacy);
    expect(hs?.roomTopic).toBe("general");
  });
});
