/**
 * Invite-accepted wake after successful chat.register (acceptor).
 * @see openspec/changes/wake-only-notifications/specs/wake-only-notifications/spec.md
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
import {
  __resetHolepunchTransport,
  storePartnerPokeHandle,
} from "@/services/p2p/HolepunchChatTransport";
import {
  peekCatalogRoom,
  upsertCatalogRoom,
} from "@/services/p2p/roomCatalogStore";
import { encodeCreateSmartBody } from "@/services/protocol/SmartMessageProtocolAdapter";
import { setActiveStorageAdapter } from "@/services/storage/StorageAdapter";

let pushWakeEnabled = false;

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

vi.mock("@/state/settingsStore", () => ({
  useSettingsStore: {
    getState: vi.fn(() => ({ privacy: { pushWakeEnabled } })),
  },
}));

const sendPokeSpy = vi.fn().mockResolvedValue(undefined);

vi.mock("@/services/poke/pokeGatewayClient", () => ({
  sendPoke: (...args: unknown[]) => sendPokeSpy(...args),
  getOwnPokeHandle: () => null,
}));

const { sendSmartMessage } = vi.hoisted(() => ({
  sendSmartMessage: vi.fn(),
}));

vi.mock("@/services/conceal/sync/spend", () => ({
  sendSmartMessage,
}));

const CONTACT_ID = "c-invite-accepted-poke";
const PAYMENT_ID_TO = "fedcba9876543210";
const PAYMENT_ID_FROM = "0123456789abcdef";
const RECIPIENT_ADDRESS = "ccx7inviteAcceptedPokeAddr0001";
/** Distinct initiator handle — must not match a generated own poke id. */
const INITIATOR_HANDLE = "k7mNpQrStUvWxY";

function testContactBinder() {
  const contact = {
    contactId: CONTACT_ID,
    address: RECIPIENT_ADDRESS,
    paymentIdFrom: PAYMENT_ID_FROM,
    paymentIdTo: PAYMENT_ID_TO,
    alias: "bob",
  };
  return {
    resolve: (contactId: string) =>
      contactId === CONTACT_ID ? contact : undefined,
    list: () => [contact],
  };
}

async function flushAsync() {
  await new Promise((r) => setTimeout(r, 0));
}

async function sendCreateInvite(): Promise<{
  inviteId: string;
  roomId: string;
}> {
  const composed = await ConcealSmartMessageAdapter.composeInviteMessage({
    contactId: CONTACT_ID,
    senderAlias: "alice",
    relationshipId: "ab".repeat(32),
  });
  const payload =
    await ConcealSmartMessageAdapter.encryptInvitePayload(composed);
  const sent = await ConcealSmartMessageAdapter.sendInviteMessage(
    CONTACT_ID,
    payload,
    {
      recipientAddress: RECIPIENT_ADDRESS,
      paymentId: PAYMENT_ID_TO,
    },
  );
  return { inviteId: sent.inviteId, roomId: composed.roomId };
}

/** Catalog row must exist before storePartnerPokeHandle can persist. */
function seedCatalogRoom(roomId: string) {
  upsertCatalogRoom({
    id: roomId,
    contactId: CONTACT_ID,
    bootstrapSource: "conceal-smart-message",
    roomKeyRef: `key:${roomId}`,
    lifecycleStatus: "pending",
    createdAt: new Date().toISOString(),
  });
}

function receivedCreateRecord(body: string): SdkMessageRecord {
  return {
    id: "tx-received-create",
    direction: "received",
    counterpartyAddress: RECIPIENT_ADDRESS,
    counterpartyName: "alice",
    body,
    hasBody: true,
    paymentIdFrom: PAYMENT_ID_FROM,
    paymentIdTo: PAYMENT_ID_TO,
    timestamp: new Date().toISOString(),
    unread: true,
    blockHeight: 1,
    threadKey: "thread",
  };
}

/** Ingest inbound chat.create with ph — no catalog seed, no storePartnerPokeHandle. */
async function ingestReceivedCreateWithPh(): Promise<{
  inviteId: string;
  roomId: string;
}> {
  const composed = await ConcealSmartMessageAdapter.composeInviteMessage({
    contactId: CONTACT_ID,
    senderAlias: "alice",
    relationshipId: "ab".repeat(32),
  });
  const smartBody = encodeCreateSmartBody(
    composed.handshake,
    composed.senderAlias,
    composed.capabilities,
    INITIATOR_HANDLE,
  );
  raw = withReceivedRecords(raw, [receivedCreateRecord(smartBody)]);
  const incoming = await ConcealSmartMessageAdapter.fetchIncomingMessages();
  const invite = incoming.find((i) => i.roomId === composed.roomId);
  if (!invite) throw new Error("expected ingested received create");
  // Ingest may load contactsStore, which rebinds delivery away from the test fixture.
  bindSmartMessageContacts(testContactBinder());
  return { inviteId: invite.id, roomId: invite.roomId };
}

beforeEach(() => {
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
  __resetSmartMessageDelivery();
  __resetHolepunchTransport();
  bindSmartMessageContacts(testContactBinder());
  sendSmartMessage.mockReset();
  sendSmartMessage.mockResolvedValue({ hash: "tx-register-ok" });
  sendPokeSpy.mockReset();
  sendPokeSpy.mockResolvedValue(undefined);
  pushWakeEnabled = false;
  raw = {
    deposits: [],
    withdrawals: [],
    transactions: [],
    lastHeight: 0,
    nonce: "",
  };
});

describe("acceptInvite wake poke", () => {
  it("pokes the initiator handle when wake is on and the handle is stored", async () => {
    pushWakeEnabled = true;
    const { inviteId, roomId } = await sendCreateInvite();
    seedCatalogRoom(roomId);
    storePartnerPokeHandle(roomId, INITIATOR_HANDLE);
    expect(peekCatalogRoom(roomId)?.partnerPokeHandle).toBe(INITIATOR_HANDLE);

    const result = await ConcealSmartMessageAdapter.acceptInvite(inviteId);
    await flushAsync();

    expect(result.roomId).toBe(roomId);
    expect(sendPokeSpy).toHaveBeenCalledOnce();
    expect(sendPokeSpy).toHaveBeenCalledWith(INITIATOR_HANDLE);
    expect(sendPokeSpy.mock.calls[0]).toHaveLength(1);
  });

  it("skips poke when wake is off and still returns roomId", async () => {
    pushWakeEnabled = false;
    const { inviteId, roomId } = await sendCreateInvite();
    seedCatalogRoom(roomId);
    storePartnerPokeHandle(roomId, INITIATOR_HANDLE);

    const result = await ConcealSmartMessageAdapter.acceptInvite(inviteId);
    await flushAsync();

    expect(result.roomId).toBe(roomId);
    expect(sendPokeSpy).not.toHaveBeenCalled();
  });

  it("skips poke when initiator handle is missing and still returns roomId", async () => {
    pushWakeEnabled = true;
    const { inviteId, roomId } = await sendCreateInvite();
    seedCatalogRoom(roomId);
    expect(peekCatalogRoom(roomId)?.partnerPokeHandle).toBeUndefined();

    const result = await ConcealSmartMessageAdapter.acceptInvite(inviteId);
    await flushAsync();

    expect(result.roomId).toBe(roomId);
    expect(sendPokeSpy).not.toHaveBeenCalled();
  });

  it("still returns roomId when sendPoke rejects", async () => {
    pushWakeEnabled = true;
    sendPokeSpy.mockRejectedValue(new Error("gateway down"));
    const { inviteId, roomId } = await sendCreateInvite();
    seedCatalogRoom(roomId);
    storePartnerPokeHandle(roomId, INITIATOR_HANDLE);

    const result = await ConcealSmartMessageAdapter.acceptInvite(inviteId);
    await flushAsync();

    expect(result.roomId).toBe(roomId);
  });

  it("pokes from received create ph without a catalog row", async () => {
    pushWakeEnabled = true;
    const { inviteId, roomId } = await ingestReceivedCreateWithPh();
    expect(peekCatalogRoom(roomId)).toBeUndefined();

    const result = await ConcealSmartMessageAdapter.acceptInvite(inviteId);
    await flushAsync();

    expect(result.roomId).toBe(roomId);
    expect(sendPokeSpy).toHaveBeenCalledOnce();
    expect(sendPokeSpy).toHaveBeenCalledWith(INITIATOR_HANDLE);
    expect(sendPokeSpy.mock.calls[0]).toHaveLength(1);
  });
});
