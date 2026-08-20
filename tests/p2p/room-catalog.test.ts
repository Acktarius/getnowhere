import { beforeEach, describe, expect, it } from "vitest";
import type { CatalogRoom } from "../../src/services/p2p/roomCatalogStore";
import {
  findCatalogRetirements,
  shouldRetireCatalogRoom,
  upsertCatalogRoom,
} from "../../src/services/p2p/roomCatalogStore";
import { setActiveStorageAdapter } from "../../src/services/storage/StorageAdapter";

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

function room(partial: Partial<CatalogRoom>): CatalogRoom {
  return {
    id: "r1",
    contactId: "c1",
    bootstrapSource: "conceal-smart-message",
    roomKeyRef: "key:r1",
    lifecycleStatus: "pending",
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

describe("room catalog retirement rules", () => {
  const now = 1_700_000_000;

  it("keeps pending rooms inside invite + room windows", () => {
    expect(
      shouldRetireCatalogRoom(
        room({
          inviteExpiry: now + 3600,
          roomTtl: now + 86400,
          lifecycleStatus: "pending",
        }),
        now,
      ),
    ).toBeNull();
  });

  it("retires unaccepted rooms after inviteExpiry", () => {
    expect(
      shouldRetireCatalogRoom(
        room({
          inviteExpiry: now - 1000,
          roomTtl: now + 86400,
          lifecycleStatus: "pending",
        }),
        now,
      ),
    ).toBe("invite_expiry");
  });

  it("does not retire accepted rooms on inviteExpiry alone", () => {
    expect(
      shouldRetireCatalogRoom(
        room({
          inviteExpiry: now - 1000,
          roomTtl: now + 86400,
          lifecycleStatus: "connected",
        }),
        now,
      ),
    ).toBeNull();
  });

  it("retires any room after roomTtl", () => {
    expect(
      shouldRetireCatalogRoom(
        room({
          inviteExpiry: now + 3600,
          roomTtl: now - 1000,
          lifecycleStatus: "connected",
        }),
        now,
      ),
    ).toBe("room_ttl");
  });

  it("findCatalogRetirements lists expired catalog rows", () => {
    upsertCatalogRoom(
      room({
        id: "expired-room",
        inviteExpiry: now + 3600,
        roomTtl: now - 1000,
        lifecycleStatus: "connected",
      }),
    );
    upsertCatalogRoom(
      room({
        id: "live-room",
        inviteExpiry: now + 3600,
        roomTtl: now + 86400,
        lifecycleStatus: "connected",
      }),
    );
    const due = findCatalogRetirements(now);
    expect(due.map((d) => d.room.id)).toEqual(["expired-room"]);
    expect(due[0]?.reason).toBe("room_ttl");
  });
});
