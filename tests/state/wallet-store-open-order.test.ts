import type { RawWalletV1 } from "conceal-wallet-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type SdkMessageRecord,
  withSentRecords,
} from "@/services/conceal/sync/messages-store";
import { setActiveStorageAdapter } from "@/services/storage/StorageAdapter";
import { useSettingsStore } from "@/state/settingsStore";

let raw: RawWalletV1 = emptyRaw();

vi.mock("@/services/conceal/sync/runtime", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/conceal/sync/runtime")>();
  return {
    ...actual,
    getRuntime: () => ({
      get raw() {
        return raw;
      },
      set raw(v: RawWalletV1) {
        raw = v;
      },
      password: "test",
      state: {},
    }),
    persistRuntime: async () => undefined,
  };
});

import { ConcealWalletService } from "@/services/conceal/ConcealWalletService";
import {
  __resetHolepunchTransport,
  getMessagesForRoom,
} from "@/services/p2p/HolepunchChatTransport";
import { encodeRelaySmartBody } from "@/services/protocol/SmartMessageProtocolAdapter";
import { useContactsStore } from "@/state/contactsStore";
import { useWalletStore } from "@/state/walletStore";

function emptyRaw(): RawWalletV1 {
  return {
    deposits: [],
    withdrawals: [],
    transactions: [],
    lastHeight: 0,
    nonce: "",
  };
}

function sentRelayRecord(roomId: string, text: string): SdkMessageRecord {
  return {
    id: "tx-sent-open-order",
    direction: "sent",
    counterpartyAddress: "ccxPeer",
    counterpartyName: "Peer",
    body: encodeRelaySmartBody({
      type: "chat.relay",
      roomId,
      sentAt: 1_700_000_000,
      text,
    }),
    hasBody: true,
    paymentIdFrom: null,
    paymentIdTo: "pid-to",
    timestamp: "2026-01-01T00:00:00.000Z",
    unread: false,
    blockHeight: 0,
    threadKey: "thread",
  };
}

/**
 * The room route mounts as soon as `initialized` flips, so transcripts must
 * already be hydrated by then.
 * @see docs/features/chat-relay.md
 */
describe("openStoredWallet hydrate ordering", () => {
  const originalHydrate = useContactsStore.getState().hydrate;

  beforeEach(() => {
    raw = emptyRaw();
    __resetHolepunchTransport();
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
    useSettingsStore.getState().setPrivacy({ localMessageRetention: true });
    useWalletStore.setState({ initialized: false, locked: true });
    vi.spyOn(ConcealWalletService, "unlockWallet").mockResolvedValue(true);
    vi.spyOn(ConcealWalletService, "getAddress").mockResolvedValue("ccxTest");
    vi.spyOn(ConcealWalletService, "resync").mockResolvedValue(undefined);
  });

  afterEach(() => {
    useContactsStore.setState({ hydrate: originalHydrate });
    vi.restoreAllMocks();
  });

  it("does not mark the wallet initialized before transcripts are hydrated", async () => {
    const roomId = "room-open-order";
    const text = "sent relay awaiting hydrate";
    raw = withSentRecords(raw, [sentRelayRecord(roomId, text)]);

    let releaseContacts: () => void = () => undefined;
    const contactsGate = new Promise<void>((resolve) => {
      releaseContacts = resolve;
    });
    useContactsStore.setState({
      hydrate: async () => {
        await contactsGate;
      },
    });

    const opening = useWalletStore.getState().openStoredWallet("pw");
    await vi.waitFor(() => {
      expect(ConcealWalletService.getAddress).toHaveBeenCalled();
    });

    expect(useWalletStore.getState().initialized).toBe(false);
    expect(getMessagesForRoom(roomId)).toEqual([]);

    releaseContacts();
    await opening;

    expect(useWalletStore.getState().initialized).toBe(true);
    expect(getMessagesForRoom(roomId).map((m) => m.text)).toContain(text);
  });
});
