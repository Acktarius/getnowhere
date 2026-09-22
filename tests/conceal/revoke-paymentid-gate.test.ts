/**
 * SEC-2026-011: revoke intake keeps only known paymentIdFrom senders.
 * @see docs/security/p2pchatprotocol.md §10
 */
import type { RawWalletV1 } from "conceal-wallet-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetSmartMessageDelivery,
  bindSmartMessageContacts,
  ConcealSmartMessageAdapter,
} from "@/services/conceal/ConcealSmartMessageAdapter";
import {
  type SdkMessageRecord,
  withReceivedRecords,
} from "@/services/conceal/sync/messages-store";
import { encodeRevokeSmartBody } from "@/services/protocol/SmartMessageProtocolAdapter";

let raw: RawWalletV1 = {
  deposits: [],
  withdrawals: [],
  transactions: [],
  lastHeight: 0,
  nonce: "",
};

const runtime = {
  get raw() {
    return raw;
  },
  set raw(v: RawWalletV1) {
    raw = v;
  },
  password: "test",
  state: {},
};

vi.mock("@/services/conceal/sync/runtime", () => ({
  getRuntime: () => runtime,
  requireRuntime: () => runtime,
  persistRuntime: async () => undefined,
  pollMempoolRuntime: async () => false,
  syncRuntime: async () => 0,
}));

const ALICE = {
  contactId: "c-alice",
  address: "ccx7alice",
  paymentIdFrom: "aaaaaaaaaaaaaaaa",
  paymentIdTo: "bbbbbbbbbbbbbbbb",
  alias: "alice",
};
const BOB = {
  contactId: "c-bob",
  address: "ccx7bob",
  paymentIdFrom: "cccccccccccccccc",
  paymentIdTo: "dddddddddddddddd",
  alias: "bob",
};

function received(id: string, body: string, paymentIdFrom: string | null) {
  return {
    id,
    direction: "received",
    counterpartyAddress: "ccx7peer",
    counterpartyName: "peer",
    body,
    hasBody: true,
    paymentIdFrom,
    paymentIdTo: null,
    timestamp: new Date().toISOString(),
    unread: true,
    blockHeight: 1,
    threadKey: "thread",
  } satisfies SdkMessageRecord;
}

function revokeBody(roomId: string) {
  return encodeRevokeSmartBody({
    type: "chat.revoke",
    inviteId: "a1b2c3d4",
    roomId,
    reasonCode: "room_revoked",
  });
}

beforeEach(() => {
  __resetSmartMessageDelivery();
  bindSmartMessageContacts({
    resolve: (id) => [ALICE, BOB].find((c) => c.contactId === id),
    list: () => [ALICE, BOB],
  });
  raw = {
    deposits: [],
    withdrawals: [],
    transactions: [],
    lastHeight: 0,
    nonce: "",
  };
});

describe("fetchIncomingRevokes paymentId gate", () => {
  it("drops unknown senders and tags known ones with their contactId", async () => {
    raw = withReceivedRecords(raw, [
      received("tx-stranger", revokeBody("01020304"), "eeeeeeeeeeeeeeee"),
      received("tx-alice", revokeBody("01020304"), ALICE.paymentIdFrom),
      received("tx-bob", revokeBody("0a0b0c0d"), BOB.paymentIdFrom),
    ]);

    const revokes = await ConcealSmartMessageAdapter.fetchIncomingRevokes();

    expect(revokes.map((r) => r.txHash).sort()).toEqual(["tx-alice", "tx-bob"]);
    expect(revokes.find((r) => r.txHash === "tx-alice")?.contactId).toBe(
      ALICE.contactId,
    );
    expect(revokes.find((r) => r.txHash === "tx-bob")?.contactId).toBe(
      BOB.contactId,
    );
  });
});
