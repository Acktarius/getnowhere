import type { RawWalletV1 } from "conceal-wallet-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readSentRecords,
  type SdkMessageRecord,
  withSentRecords,
} from "@/services/conceal/sync/messages-store";
import { readChatRooms } from "@/services/p2p/chatRoomsBlob";
import { setActiveStorageAdapter } from "@/services/storage/StorageAdapter";
import { useSettingsStore } from "@/state/settingsStore";
import type { ChatMessage } from "@/types/models";

let raw: RawWalletV1 = emptyRaw();

vi.mock("@/services/conceal/sync/runtime", () => ({
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
}));

import { ConcealSmartMessageAdapter } from "@/services/conceal/ConcealSmartMessageAdapter";
import {
  __resetHolepunchTransport,
  flushChatTranscriptsOnHide,
  getMessagesForRoom,
  HolepunchChatTransport,
  holdChatRoomFlush,
  hydrateChatRoomsFromWallet,
  ingestChatRelay,
  saveChatRoomsToWallet,
} from "@/services/p2p/HolepunchChatTransport";
import {
  __setHolepunchSidecarBackend,
  createMemorySidecarBackend,
} from "@/services/p2p/HolepunchSidecarClient";
import { encodeRelaySmartBody } from "@/services/protocol/SmartMessageProtocolAdapter";
import { useChatStore } from "@/state/chatStore";

function emptyRaw(): RawWalletV1 {
  return {
    deposits: [],
    withdrawals: [],
    transactions: [],
    lastHeight: 0,
    nonce: "",
  };
}

function sdkRecord(id: string, body: string): SdkMessageRecord {
  return {
    id,
    direction: "sent",
    counterpartyAddress: "ccxPeer",
    counterpartyName: "Peer",
    body,
    hasBody: true,
    paymentIdFrom: null,
    paymentIdTo: "pid-to",
    timestamp: "2026-01-01T00:00:00.000Z",
    unread: false,
    blockHeight: 0,
    threadKey: "thread",
  };
}

function liveMessage(roomId: string, id: string, text: string): ChatMessage {
  return {
    id,
    roomId,
    direction: "out",
    text,
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "sent",
    channel: "live",
  };
}

function relayBody(roomId: string, sentAt: number, text: string): string {
  return encodeRelaySmartBody({ type: "chat.relay", roomId, sentAt, text });
}

async function createAcceptedRoom(roomId: string): Promise<void> {
  await HolepunchChatTransport.createRoom({
    contactId: "c1",
    bootstrap: {
      roomId,
      roomKeyRef: `key:${roomId}`,
      bootstrapSource: "conceal-smart-message",
      lifecycleStatus: "accepted",
    },
  });
}

/** Drop in-memory shells but keep durable catalog + wallet blob (WKWebView remount). */
function simulateWebViewRemount(): void {
  __resetHolepunchTransport();
  __setHolepunchSidecarBackend(createMemorySidecarBackend());
  useChatStore.setState({ rooms: [], messagesByRoom: {}, activeRoomId: null });
}

function texts(messages: ChatMessage[]): string[] {
  return messages.map((m) => m.text);
}

function blobTexts(roomId: string): string[] {
  const entry = readChatRooms(raw)[roomId];
  return entry && "messages" in entry ? texts(entry.messages) : [];
}

/**
 * Regression: relay sent while the peer was backgrounded vanished after the
 * sender backgrounded and returned (iOS). Covers the remount and the
 * room-opens-before-hydrate orderings.
 * @see docs/features/chat-relay.md
 */
describe("L1′ relay survives background, remount and hydrate ordering", () => {
  beforeEach(() => {
    raw = emptyRaw();
    __resetHolepunchTransport();
    __setHolepunchSidecarBackend(createMemorySidecarBackend());
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
    useChatStore.setState({
      rooms: [],
      messagesByRoom: {},
      activeRoomId: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps a sent relay after hide flush and WebView remount", async () => {
    vi.spyOn(ConcealSmartMessageAdapter, "sendChatRelay").mockImplementation(
      async ({ relay }) => {
        raw = withSentRecords(raw, [
          ...readSentRecords(raw),
          sdkRecord(
            `tx-${relay.sentAt}`,
            relayBody(relay.roomId, relay.sentAt, relay.text),
          ),
        ]);
        return { txHash: `tx-${relay.sentAt}` };
      },
    );
    const roomId = "room-bg-remount";
    const text = "sent while she was backgrounded";
    await createAcceptedRoom(roomId);
    await HolepunchChatTransport.sendMessage(roomId, text);

    await flushChatTranscriptsOnHide();
    simulateWebViewRemount();
    hydrateChatRoomsFromWallet();

    const restored = getMessagesForRoom(roomId).filter((m) => m.text === text);
    expect(restored).toHaveLength(1);
    expect(restored[0]?.direction).toBe("out");
    expect(restored[0]?.status).toBe("sent");
  });

  it("shows hydrated rows in the UI when the room opened before hydrate", async () => {
    const roomId = "room-open-before-hydrate";
    const liveText = "persisted live row";
    const relayText = "persisted sent relay";
    await createAcceptedRoom(roomId);
    simulateWebViewRemount();
    raw = {
      ...raw,
      chatRooms: {
        [roomId]: {
          roomId,
          revoked: false,
          messages: [liveMessage(roomId, "m-live", liveText)],
        },
      },
    };
    raw = withSentRecords(raw, [
      sdkRecord("tx-sent", relayBody(roomId, 1_700_000_000, relayText)),
    ]);

    const store = useChatStore.getState();
    await store.openRoom(roomId);
    store.subscribeRoom(roomId);
    store.setMessages(roomId, getMessagesForRoom(roomId));
    expect(useChatStore.getState().messagesByRoom[roomId]).toEqual([]);

    hydrateChatRoomsFromWallet();

    expect(texts(useChatStore.getState().messagesByRoom[roomId] ?? [])).toEqual(
      expect.arrayContaining([liveText, relayText]),
    );
  });

  it("holds flush while hydrate is pending so the saved snapshot survives", async () => {
    const roomId = "room-early-flush";
    const liveText = "persisted live row";
    const laterText = "sent after hydrate";
    await createAcceptedRoom(roomId);
    simulateWebViewRemount();
    raw = {
      ...raw,
      chatRooms: {
        [roomId]: {
          roomId,
          revoked: false,
          messages: [liveMessage(roomId, "m-live", liveText)],
        },
      },
    };
    holdChatRoomFlush();
    await HolepunchChatTransport.getRoom(roomId);

    await saveChatRoomsToWallet();

    expect(blobTexts(roomId)).toEqual([liveText]);
    hydrateChatRoomsFromWallet();
    expect(texts(getMessagesForRoom(roomId))).toContain(liveText);

    await ingestChatRelay({
      type: "chat.relay",
      roomId,
      sentAt: 1_700_000_200,
      text: laterText,
    });
    await saveChatRoomsToWallet();
    expect(blobTexts(roomId)).toEqual(
      expect.arrayContaining([liveText, laterText]),
    );
  });

  it("a message arriving before hydrate does not drop the saved snapshot", async () => {
    const roomId = "room-early-arrival";
    const liveText = "persisted live row";
    const earlyText = "arrived before hydrate";
    await createAcceptedRoom(roomId);
    simulateWebViewRemount();
    raw = {
      ...raw,
      chatRooms: {
        [roomId]: {
          roomId,
          revoked: false,
          messages: [liveMessage(roomId, "m-live", liveText)],
        },
      },
    };
    await HolepunchChatTransport.getRoom(roomId);
    await ingestChatRelay({
      type: "chat.relay",
      roomId,
      sentAt: 1_700_000_100,
      text: earlyText,
    });

    hydrateChatRoomsFromWallet();

    expect(texts(getMessagesForRoom(roomId))).toEqual(
      expect.arrayContaining([liveText, earlyText]),
    );
  });
});
