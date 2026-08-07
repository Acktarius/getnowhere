import type { RawWalletV1 } from "conceal-wallet-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Contact } from "@/types/models";

let raw: RawWalletV1 = {
  deposits: [],
  withdrawals: [],
  transactions: [],
  lastHeight: 0,
  nonce: "",
};
let scannedHeight = 500;
let networkHeight = 500;

vi.mock("@/services/conceal/sync/runtime", () => ({
  getRuntime: () => ({
    raw,
    state: { scannedHeight },
    daemon: {
      getHeight: async () => networkHeight,
    },
  }),
}));

import {
  listCatalogRooms,
  upsertCatalogRoom,
} from "@/services/p2p/roomCatalogStore";
import {
  planRoomRestores,
  pruneRoomsForMissingContacts,
} from "@/services/p2p/roomChainRestore";
import { setActiveStorageAdapter } from "@/services/storage/StorageAdapter";

const contact: Contact = {
  id: "c1",
  alias: "Bob",
  ccxAddress: "ccxBob",
  paymentIdFrom: "pid-from-bob",
  paymentIdTo: "pid-to-us",
  relationshipStatus: "eligible",
  inviteStatus: "accepted",
  chatStatus: "active",
  roomId: "room-restore-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("room chain restore", () => {
  beforeEach(() => {
    raw = {
      deposits: [],
      withdrawals: [],
      transactions: [],
      lastHeight: 0,
      nonce: "",
      chatRooms: {
        "room-restore-1": {
          roomId: "room-restore-1",
          revoked: false,
          messages: [
            {
              id: "m1",
              roomId: "room-restore-1",
              direction: "in",
              text: "hello back",
              createdAt: "2026-01-02T00:00:00.000Z",
              status: "delivered",
            },
          ],
        },
      },
    };
    scannedHeight = 500;
    networkHeight = 500;
    const mem = new Map<string, string>();
    setActiveStorageAdapter({
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => {
        mem.set(k, v);
      },
      removeItem: (k) => {
        mem.delete(k);
      },
    });
  });

  it("restores accepted room from wallet transcript + contact when near tip", async () => {
    const plans = await planRoomRestores([contact]);
    expect(plans.some((p) => p.roomId === "room-restore-1")).toBe(true);
    expect(plans[0]?.awaitingChainSync).toBe(false);
  });

  it("marks restored room awaitingChainSync while wallet lag exceeds one block", async () => {
    scannedHeight = 100;
    networkHeight = 500;
    const plans = await planRoomRestores([contact]);
    expect(plans[0]?.awaitingChainSync).toBe(true);
  });

  it("prunes catalog rooms whose contact was deleted", () => {
    upsertCatalogRoom({
      id: "orphan-room",
      contactId: "gone",
      bootstrapSource: "conceal-smart-message",
      roomKeyRef: "key:orphan-room",
      lifecycleStatus: "accepted",
      createdAt: new Date().toISOString(),
    });
    const removed = pruneRoomsForMissingContacts([contact]);
    expect(removed).toContain("orphan-room");
    expect(listCatalogRooms().some((r) => r.id === "orphan-room")).toBe(false);
  });
});
