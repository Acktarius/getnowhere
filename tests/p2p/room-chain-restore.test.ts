import type { RawWalletV1 } from "conceal-wallet-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SdkMessageRecord } from "@/services/conceal/sync/messages-store";
import {
  encodeCreateSmartBody,
  encodeRegisterSmartBody,
} from "@/services/protocol/SmartMessageProtocolAdapter";
import type { Contact } from "@/types/models";
import type { ChatInviteHandshake } from "@/types/protocol";

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
  isRoomRevoked,
  rememberRevokedRoom,
} from "@/services/p2p/revokedRoomsStore";
import {
  listCatalogRooms,
  upsertCatalogRoom,
} from "@/services/p2p/roomCatalogStore";
import {
  applyRestoredRoomCatalog,
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
  inviteStatus: "none",
  chatStatus: "none",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

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

function msgRecord(
  direction: SdkMessageRecord["direction"],
  body: string,
  id: string,
): SdkMessageRecord {
  return {
    id,
    direction,
    counterpartyAddress: "ccxBob",
    counterpartyName: "Bob",
    body,
    hasBody: true,
    paymentIdFrom: direction === "received" ? "pid-from-bob" : null,
    paymentIdTo: direction === "sent" ? "pid-to-us" : null,
    timestamp: "2026-01-01T00:00:00.000Z",
    unread: false,
    blockHeight: 100,
    threadKey: "thread",
  };
}

describe("room file-import restore", () => {
  beforeEach(() => {
    raw = {
      deposits: [],
      withdrawals: [],
      transactions: [],
      lastHeight: 0,
      nonce: "",
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

  it("returns no plans when restoreFromFileImport is false", async () => {
    raw.chatRooms = {
      "room-restore-1": {
        roomId: "11223344",
        revoked: false,
        messages: [
          {
            id: "m1",
            roomId: "11223344",
            direction: "in",
            text: "hello",
            createdAt: "2026-01-02T00:00:00.000Z",
            status: "delivered",
          },
        ],
      },
    };
    const plans = await planRoomRestores([contact], {
      restoreFromFileImport: false,
    });
    expect(plans).toHaveLength(0);
  });

  it("restores accepted room from file messages when near tip", async () => {
    const hs = sampleHandshake();
    raw.sentMessages = [
      msgRecord(
        "sent",
        encodeCreateSmartBody(hs, "alice", ["chat.v1"]),
        "tx-c",
      ),
    ];
    raw.receivedMessages = [
      msgRecord(
        "received",
        encodeRegisterSmartBody({
          inviteId: hs.inviteId,
          receiverEphemeralPublicKey: "55".repeat(32),
          replayId: "66".repeat(8),
        }),
        "tx-r",
      ),
    ];
    const plans = await planRoomRestores([contact], {
      restoreFromFileImport: true,
    });
    expect(plans).toHaveLength(1);
    expect(plans[0]?.kind).toBe("accepted");
    expect(plans[0]?.awaitingChainSync).toBe(false);
  });

  it("marks accepted file-replayed room awaitingChainSync while lagging tip", async () => {
    scannedHeight = 100;
    networkHeight = 500;
    const hs = sampleHandshake();
    raw.sentMessages = [
      msgRecord(
        "sent",
        encodeCreateSmartBody(hs, "alice", ["chat.v1"]),
        "tx-c",
      ),
    ];
    raw.receivedMessages = [
      msgRecord(
        "received",
        encodeRegisterSmartBody({
          inviteId: hs.inviteId,
          receiverEphemeralPublicKey: "55".repeat(32),
          replayId: "66".repeat(8),
        }),
        "tx-r",
      ),
    ];
    const plans = await planRoomRestores([contact], {
      restoreFromFileImport: true,
    });
    expect(plans[0]?.awaitingChainSync).toBe(true);
  });

  it("skips expired roomTtl", async () => {
    const now = Math.floor(Date.now() / 1000);
    const hs = sampleHandshake({
      roomTtl: now - 3600,
      inviteExpiry: now + 3600,
    });
    raw.sentMessages = [
      msgRecord(
        "sent",
        encodeCreateSmartBody(hs, "alice", ["chat.v1"]),
        "tx-c",
      ),
    ];
    const plans = await planRoomRestores([contact], {
      restoreFromFileImport: true,
    });
    expect(plans).toHaveLength(0);
  });

  it("tombstones roomId when invite expired without accept", async () => {
    const now = Math.floor(Date.now() / 1000);
    const hs = sampleHandshake({
      inviteExpiry: now - 3600,
      roomTtl: now + 86400,
    });
    raw.sentMessages = [
      msgRecord(
        "sent",
        encodeCreateSmartBody(hs, "alice", ["chat.v1"]),
        "tx-c",
      ),
    ];
    const plans = await planRoomRestores([contact], {
      restoreFromFileImport: true,
    });
    expect(plans).toHaveLength(0);
    expect(isRoomRevoked(hs.roomId)).toBe(true);
  });

  it("keeps pending invite within inviteExpiry", async () => {
    const hs = sampleHandshake();
    raw.receivedMessages = [
      msgRecord(
        "received",
        encodeCreateSmartBody(hs, "bob", ["chat.v1"]),
        "tx-c",
      ),
    ];
    const plans = await planRoomRestores([contact], {
      restoreFromFileImport: true,
    });
    expect(plans).toHaveLength(1);
    expect(plans[0]?.kind).toBe("pending");
    expect(plans[0]?.awaitingChainSync).toBe(false);
  });

  it("does not restore register-only without create", async () => {
    raw.receivedMessages = [
      msgRecord(
        "received",
        encodeRegisterSmartBody({
          inviteId: "aabbccdd",
          receiverEphemeralPublicKey: "55".repeat(32),
          replayId: "66".repeat(8),
        }),
        "tx-r",
      ),
    ];
    const plans = await planRoomRestores([contact], {
      restoreFromFileImport: true,
    });
    expect(plans).toHaveLength(0);
  });

  it("applyRestoredRoomCatalog writes catalog for accepted plans", () => {
    const hs = sampleHandshake();
    applyRestoredRoomCatalog([
      {
        roomId: hs.roomId,
        inviteId: hs.inviteId,
        contactId: contact.id,
        handshake: hs,
        invite: {
          id: "tx:1",
          contactId: contact.id,
          roomId: hs.roomId,
          inviteId: hs.inviteId,
          replayId: hs.replayId,
          nonce: "",
          expiry: new Date(hs.inviteExpiry * 1000).toISOString(),
          inviteExpiry: hs.inviteExpiry,
          roomTtl: hs.roomTtl,
          senderAlias: "alice",
          capabilities: [],
          bootstrapEncrypted: "",
          status: "accepted",
          createdAt: new Date().toISOString(),
        },
        kind: "accepted",
        awaitingChainSync: true,
      },
    ]);
    const row = listCatalogRooms().find((r) => r.id === hs.roomId);
    expect(row?.awaitingChainSync).toBe(true);
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

  it("respects existing revoked tombstone", async () => {
    const hs = sampleHandshake();
    rememberRevokedRoom(hs.roomId, hs.inviteId);
    raw.sentMessages = [
      msgRecord(
        "sent",
        encodeCreateSmartBody(hs, "alice", ["chat.v1"]),
        "tx-c",
      ),
    ];
    raw.receivedMessages = [
      msgRecord(
        "received",
        encodeRegisterSmartBody({
          inviteId: hs.inviteId,
          receiverEphemeralPublicKey: "55".repeat(32),
          replayId: "66".repeat(8),
        }),
        "tx-r",
      ),
    ];
    const plans = await planRoomRestores([contact], {
      restoreFromFileImport: true,
    });
    expect(plans).toHaveLength(0);
  });
});
