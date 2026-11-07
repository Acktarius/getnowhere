import type { RawWalletV1 } from "conceal-wallet-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setActiveStorageAdapter } from "@/services/storage/StorageAdapter";
import type { ChatInviteHandshake } from "@/types/protocol";

const persistRuntime = vi.fn(async () => undefined);
let raw: RawWalletV1 = {
  deposits: [],
  withdrawals: [],
  transactions: [],
  lastHeight: 0,
  nonce: "",
};
let runtimeAvailable = true;

vi.mock("@/services/conceal/sync/runtime", () => ({
  getRuntime: () => {
    if (!runtimeAvailable) return null;
    return {
      get raw() {
        return raw;
      },
      set raw(v: RawWalletV1) {
        raw = v;
      },
      password: "test",
      state: {},
    };
  },
  persistRuntime: (...args: unknown[]) => persistRuntime(...args),
  requireRuntime: () => {
    if (!runtimeAvailable) throw new Error("locked");
    return {
      get raw() {
        return raw;
      },
      set raw(v: RawWalletV1) {
        raw = v;
      },
      password: "test",
      state: {},
    };
  },
}));

vi.mock("@/services/p2p/topicEpochContactSync", () => ({
  seedTopicEpochStoreFromContacts: vi.fn(async () => undefined),
}));

import {
  hydrateContacts,
  loadPendingInitiatorKeys,
  migrateLegacyPendingInitiatorKeys,
  type PendingInitiatorRecord,
  readPendingInviteEphemerals,
  removePendingInitiatorKey,
  removePendingInitiatorKeysForRoom,
  upsertPendingInitiatorKey,
  withPendingInviteEphemerals,
} from "@/services/contacts/contactsPersistence";

function emptyRaw(): RawWalletV1 {
  return {
    deposits: [],
    withdrawals: [],
    transactions: [],
    lastHeight: 0,
    nonce: "",
  };
}

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

function sampleRecord(
  overrides: Partial<PendingInitiatorRecord> = {},
): PendingInitiatorRecord {
  return {
    inviteId: "aabbccdd",
    contactId: "contact-1",
    roomId: "11223344",
    privateKeyHex: "aa".repeat(32),
    handshake: sampleHandshake(),
    peerRole: "initiator",
    ...overrides,
  };
}

const LEGACY_KV = "gnh.pendingInitiatorKeys";

describe("pendingInviteEphemerals on wallet raw", () => {
  let mem: Map<string, string>;

  beforeEach(() => {
    raw = emptyRaw();
    runtimeAvailable = true;
    persistRuntime.mockClear();
    mem = new Map();
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

  it("readPendingInviteEphemerals returns [] when field missing", () => {
    expect(readPendingInviteEphemerals(raw)).toEqual([]);
  });

  it("withPendingInviteEphemerals round-trips via read", () => {
    const records = [sampleRecord()];
    const next = withPendingInviteEphemerals(raw, records);
    expect(readPendingInviteEphemerals(next)).toEqual(records);
  });

  it("upsert writes into raw and persistRuntime, not legacy KV", async () => {
    const record = sampleRecord();
    await upsertPendingInitiatorKey(record);

    expect(readPendingInviteEphemerals(raw)).toEqual([record]);
    expect(persistRuntime).toHaveBeenCalled();
    expect(mem.has(LEGACY_KV)).toBe(false);
    expect(loadPendingInitiatorKeys()).toEqual([record]);
  });

  it("remove drops the invite from raw without writing legacy KV", async () => {
    await upsertPendingInitiatorKey(sampleRecord());
    persistRuntime.mockClear();

    await removePendingInitiatorKey("aabbccdd");

    expect(readPendingInviteEphemerals(raw)).toEqual([]);
    expect(persistRuntime).toHaveBeenCalled();
    expect(mem.has(LEGACY_KV)).toBe(false);
  });

  it("load returns [] when wallet is locked", () => {
    raw = withPendingInviteEphemerals(emptyRaw(), [sampleRecord()]);
    runtimeAvailable = false;
    expect(loadPendingInitiatorKeys()).toEqual([]);
  });
  it("removePendingInitiatorKeysForRoom clears all records for a room", async () => {
    await upsertPendingInitiatorKey(sampleRecord({ inviteId: "a1" }));
    await upsertPendingInitiatorKey(
      sampleRecord({
        inviteId: "b2",
        roomId: "99999999",
        handshake: sampleHandshake({ inviteId: "b2", roomId: "99999999" }),
      }),
    );
    persistRuntime.mockClear();

    await removePendingInitiatorKeysForRoom("11223344");

    expect(readPendingInviteEphemerals(raw).map((r) => r.inviteId)).toEqual([
      "b2",
    ]);
    expect(persistRuntime).toHaveBeenCalled();
  });
});

describe("migrateLegacyPendingInitiatorKeys", () => {
  let mem: Map<string, string>;

  beforeEach(() => {
    raw = emptyRaw();
    runtimeAvailable = true;
    persistRuntime.mockClear();
    mem = new Map();
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

  it("merges legacy KV into blob then deletes the KV key", async () => {
    const legacy = sampleRecord({
      inviteId: "legacy01",
      privateKeyHex: "cc".repeat(32),
    });
    mem.set(LEGACY_KV, JSON.stringify([legacy]));

    await migrateLegacyPendingInitiatorKeys();

    expect(readPendingInviteEphemerals(raw)).toEqual([legacy]);
    expect(mem.has(LEGACY_KV)).toBe(false);
    expect(persistRuntime).toHaveBeenCalled();
  });

  it("merges without overwriting newer blob records for same inviteId", async () => {
    const blobRec = sampleRecord({ privateKeyHex: "dd".repeat(32) });
    const legacyRec = sampleRecord({ privateKeyHex: "ee".repeat(32) });
    raw = withPendingInviteEphemerals(emptyRaw(), [blobRec]);
    mem.set(LEGACY_KV, JSON.stringify([legacyRec]));

    await migrateLegacyPendingInitiatorKeys();

    expect(readPendingInviteEphemerals(raw)).toEqual([blobRec]);
    expect(mem.has(LEGACY_KV)).toBe(false);
  });

  it("hydrateContacts migrates legacy KV when runtime is open", async () => {
    const legacy = sampleRecord({ inviteId: "hyd01" });
    mem.set(LEGACY_KV, JSON.stringify([legacy]));

    await hydrateContacts();

    expect(readPendingInviteEphemerals(raw)).toEqual([legacy]);
    expect(mem.has(LEGACY_KV)).toBe(false);
  });
});
