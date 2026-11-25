/**
 * Adapter acceptInvite forwards `deferPersist` to the register broadcast; wake poke unchanged.
 * @see openspec/changes/accept-invite-fast-open/design.md
 */
import type { RawWalletV1 } from "conceal-wallet-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetSmartMessageDelivery,
  bindSmartMessageContacts,
  ConcealSmartMessageAdapter,
} from "@/services/conceal/ConcealSmartMessageAdapter";
import {
  __resetHolepunchTransport,
  storePartnerPokeHandle,
} from "@/services/p2p/HolepunchChatTransport";
import { upsertCatalogRoom } from "@/services/p2p/roomCatalogStore";
import { setActiveStorageAdapter } from "@/services/storage/StorageAdapter";

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
  isSyncInProgress: () => false,
}));

vi.mock("@/state/settingsStore", () => ({
  useSettingsStore: {
    getState: vi.fn(() => ({ privacy: { pushWakeEnabled: true } })),
  },
}));

const { sendSmartMessage, sendPoke } = vi.hoisted(() => ({
  sendSmartMessage: vi.fn(),
  sendPoke: vi.fn(),
}));

vi.mock("@/services/poke/pokeGatewayClient", () => ({
  sendPoke,
  getOwnPokeHandle: () => null,
}));

vi.mock("@/services/conceal/sync/spend", () => ({ sendSmartMessage }));

const CONTACT_ID = "c-accept-defer";
const PAYMENT_ID_TO = "fedcba9876543210";
const RECIPIENT_ADDRESS = "ccx7acceptDeferPersistAddr0001";
const INITIATOR_HANDLE = "k7mNpQrStUvWxY";

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
  const contact = {
    contactId: CONTACT_ID,
    address: RECIPIENT_ADDRESS,
    paymentIdFrom: "0123456789abcdef",
    paymentIdTo: PAYMENT_ID_TO,
    alias: "bob",
  };
  bindSmartMessageContacts({
    resolve: (id: string) => (id === CONTACT_ID ? contact : undefined),
    list: () => [contact],
  });
  sendSmartMessage.mockReset();
  sendSmartMessage.mockResolvedValue({ hash: "tx-register-ok" });
  sendPoke.mockReset();
  sendPoke.mockResolvedValue(undefined);
});

async function sentInvite(): Promise<{ inviteId: string; roomId: string }> {
  const composed = await ConcealSmartMessageAdapter.composeInviteMessage({
    contactId: CONTACT_ID,
    senderAlias: "alice",
    relationshipId: "ab".repeat(32),
  });
  const sent = await ConcealSmartMessageAdapter.sendInviteMessage(
    CONTACT_ID,
    composed.smartBody,
    { recipientAddress: RECIPIENT_ADDRESS, paymentId: PAYMENT_ID_TO },
  );
  upsertCatalogRoom({
    id: composed.roomId,
    contactId: CONTACT_ID,
    bootstrapSource: "conceal-smart-message",
    roomKeyRef: `key:${composed.roomId}`,
    lifecycleStatus: "pending",
    createdAt: new Date().toISOString(),
  });
  storePartnerPokeHandle(composed.roomId, INITIATOR_HANDLE);
  sendSmartMessage.mockClear();
  return {
    inviteId: sent.inviteId,
    roomId: composed.roomId,
  };
}

describe("adapter acceptInvite deferPersist", () => {
  it("forwards deferPersist to sendSmartMessage and still pokes", async () => {
    const { inviteId, roomId } = await sentInvite();

    const result = await ConcealSmartMessageAdapter.acceptInvite(
      inviteId,
      undefined,
      { deferPersist: true },
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(result.roomId).toBe(roomId);
    expect(sendSmartMessage).toHaveBeenCalledOnce();
    expect(sendSmartMessage.mock.calls[0][0]).toMatchObject({
      deferPersist: true,
    });
    expect(sendPoke).toHaveBeenCalledWith(INITIATOR_HANDLE);
  });

  it("omits deferPersist by default", async () => {
    const { inviteId } = await sentInvite();

    await ConcealSmartMessageAdapter.acceptInvite(inviteId);

    expect(sendSmartMessage.mock.calls[0][0].deferPersist).toBeUndefined();
  });
});
