/**
 * SEC-2026-010: register intake keeps only known paymentIdFrom senders.
 * @see docs/security/p2pchatprotocol.md §6
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
import { encodeRegisterSmartBody } from "@/services/protocol/SmartMessageProtocolAdapter";

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

function registerBody() {
  return encodeRegisterSmartBody({
    type: "chat.register",
    inviteId: "a1b2c3d4",
    receiverEphemeralPublicKey: "11".repeat(32),
    replayId: "22".repeat(8),
    pokeHandle: "k7mNpQrStUvWxY",
  });
}

beforeEach(() => {
  __resetSmartMessageDelivery();
  bindSmartMessageContacts({
    resolve: (id) => (id === ALICE.contactId ? ALICE : undefined),
    list: () => [ALICE],
  });
  raw = {
    deposits: [],
    withdrawals: [],
    transactions: [],
    lastHeight: 0,
    nonce: "",
  };
});

describe("fetchIncomingRegisters paymentId gate", () => {
  it("drops unknown senders and tags the known contact", async () => {
    const body = registerBody();
    raw = withReceivedRecords(raw, [
      received("tx-stranger", body, "eeeeeeeeeeeeeeee"),
      received("tx-alice", body, ALICE.paymentIdFrom),
    ]);

    const registers = await ConcealSmartMessageAdapter.fetchIncomingRegisters();

    expect(registers.map((r) => r.txHash)).toEqual(["tx-alice"]);
    expect(registers[0]?.contactId).toBe(ALICE.contactId);
  });
});
