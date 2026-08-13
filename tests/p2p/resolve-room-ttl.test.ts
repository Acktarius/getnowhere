import { beforeEach, describe, expect, it } from "vitest";
import { rememberHandshake } from "@/services/conceal/ConcealSmartMessageAdapter";
import { resolveRoomTtl } from "@/services/p2p/resolveRoomTtl";
import { upsertCatalogRoom } from "@/services/p2p/roomCatalogStore";
import { setActiveStorageAdapter } from "@/services/storage/StorageAdapter";
import type { ChatInviteHandshake } from "@/types/protocol";

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  setActiveStorageAdapter({
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => {
      memory.set(k, v);
    },
    removeItem: (k) => {
      memory.delete(k);
    },
  });
});

describe("resolveRoomTtl", () => {
  const ttl = 1_800_000_000;

  it("falls back to in-memory handshake when room record lacks roomTtl", () => {
    const handshake: ChatInviteHandshake = {
      protocolVersion: 1,
      inviteId: "inv1",
      relationshipId: "rel1",
      roomId: "e24dfa85",
      cipherSuite: "CHACHA20_POLY1305_V1",
      senderEphemeralPublicKey: "aa".repeat(32),
      kdf: "HKDF_SHA256_V1",
      nonceSeed: "bb".repeat(8),
      nonceStrategy: "counter_from_seed",
      salt: "cc".repeat(32),
      inviteExpiry: ttl + 3600,
      roomTtl: ttl,
      replayId: "dd".repeat(8),
    };
    rememberHandshake(handshake);
    expect(
      resolveRoomTtl({ roomId: "e24dfa85", inviteId: "inv1" }),
    ).toBe(ttl);
  });

  it("reads roomTtl from catalog when live room omitted it", () => {
    upsertCatalogRoom({
      id: "room-cat",
      contactId: "c1",
      bootstrapSource: "conceal-smart-message",
      roomKeyRef: "key:room-cat",
      lifecycleStatus: "accepted",
      roomTtl: ttl,
      createdAt: new Date().toISOString(),
    });
    expect(resolveRoomTtl({ roomId: "room-cat" })).toBe(ttl);
  });
});
