/**
 * `persistWallet: false` stages contacts and stash removal in `rt.raw` without a wallet save.
 */
import type { RawWalletV1 } from "conceal-wallet-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setActiveStorageAdapter } from "@/services/storage/StorageAdapter";
import type { Contact } from "@/types/models";
import type { ChatInviteHandshake } from "@/types/protocol";

const persistRuntime = vi.fn(async () => undefined);
let raw: RawWalletV1 = emptyRaw();

vi.mock("@/services/conceal/sync/runtime", () => {
  const rt = {
    get raw() {
      return raw;
    },
    set raw(v: RawWalletV1) {
      raw = v;
    },
    password: "test",
    state: {},
  };
  return {
    getRuntime: () => rt,
    requireRuntime: () => rt,
    persistRuntime: (...args: unknown[]) => persistRuntime(...args),
  };
});

vi.mock("@/services/p2p/topicEpochContactSync", () => ({
  seedTopicEpochStoreFromContacts: vi.fn(async () => undefined),
}));

import {
  type PendingInitiatorRecord,
  persistContacts,
  readAddressBook,
  readPendingInviteEphemerals,
  removePendingInitiatorKey,
  withPendingInviteEphemerals,
} from "@/services/contacts/contactsPersistence";

const CONTACTS_KEY = "gnh.contacts";

function emptyRaw(): RawWalletV1 {
  return {
    deposits: [],
    withdrawals: [],
    transactions: [],
    lastHeight: 0,
    nonce: "",
  };
}

function record(inviteId: string): PendingInitiatorRecord {
  const now = Math.floor(Date.now() / 1000);
  return {
    inviteId,
    contactId: `contact-${inviteId}`,
    roomId: `room-${inviteId}`,
    privateKeyHex: "aa".repeat(32),
    handshake: {
      protocolVersion: 1,
      inviteId,
      relationshipId: "bb".repeat(32),
      roomId: `room-${inviteId}`,
      cipherSuite: "CHACHA20_POLY1305_V1",
      senderEphemeralPublicKey: "11".repeat(32),
      kdf: "HKDF_SHA256_V1",
      nonceSeed: "22".repeat(8),
      nonceStrategy: "counter_from_seed",
      salt: "33".repeat(16),
      inviteExpiry: now + 3600,
      roomTtl: now + 86400,
      replayId: "44".repeat(8),
    } satisfies ChatInviteHandshake,
    peerRole: "initiator",
  };
}

function contact(id: string): Contact {
  const now = new Date().toISOString();
  return {
    id,
    alias: `Alias ${id}`,
    ccxAddress: `ccx-${id}`,
    paymentIdFrom: `pid-${id}`,
    relationshipStatus: "eligible",
    inviteStatus: "accepted",
    chatStatus: "ready",
    createdAt: now,
    updatedAt: now,
  } as Contact;
}

describe("stage contacts state without a wallet save", () => {
  let mem: Map<string, string>;

  beforeEach(() => {
    raw = emptyRaw();
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

  it("removePendingInitiatorKey with persistWallet: false drops the record only in rt.raw", async () => {
    const kept = record("keep01");
    raw = withPendingInviteEphemerals(emptyRaw(), [record("drop01"), kept]);

    await removePendingInitiatorKey("drop01", { persistWallet: false });

    expect(readPendingInviteEphemerals(raw)).toEqual([kept]);
    expect(persistRuntime).not.toHaveBeenCalled();
  });

  it("removePendingInitiatorKey default still persists once", async () => {
    raw = withPendingInviteEphemerals(emptyRaw(), [record("drop02")]);

    await removePendingInitiatorKey("drop02");

    expect(readPendingInviteEphemerals(raw)).toEqual([]);
    expect(persistRuntime).toHaveBeenCalledTimes(1);
  });

  it("persistContacts with persistWallet: false writes local and rt.raw only", async () => {
    const contacts = [contact("c1"), contact("c2")];

    await persistContacts(contacts, { persistWallet: false });

    const local = JSON.parse(mem.get(CONTACTS_KEY) ?? "[]") as Contact[];
    expect(local.map((c) => c.id)).toEqual(contacts.map((c) => c.id));
    expect(readAddressBook(raw).map((e) => e.id)).toEqual(
      contacts.map((c) => c.id),
    );
    expect(persistRuntime).not.toHaveBeenCalled();
  });

  it("persistContacts default still persists once", async () => {
    const contacts = [contact("c3")];

    await persistContacts(contacts);

    expect(readAddressBook(raw).map((e) => e.id)).toEqual(["c3"]);
    expect(persistRuntime).toHaveBeenCalledTimes(1);
  });
});
