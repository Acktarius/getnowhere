/**
 * L1′ TTL erase (RED). Room memory, no chatRooms persist, hydrate skip.
 * @see openspec/changes/l1-prime-ttl-relay/specs/l1-prime-ttl-relay/spec.md
 */
import type { RawWalletV1 } from "conceal-wallet-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetSmartMessageDelivery,
  bindSmartMessageContacts,
  ConcealSmartMessageAdapter,
} from "@/services/conceal/ConcealSmartMessageAdapter";
import {
  type SdkMessageRecord,
  withReceivedRecords,
  withSentRecords,
} from "@/services/conceal/sync/messages-store";
import {
  readChatRooms,
  saveActiveMessages,
  withChatRooms,
} from "@/services/p2p/chatRoomsBlob";
import { setActiveStorageAdapter } from "@/services/storage/StorageAdapter";
import { useChatStore } from "@/state/chatStore";
import { useSettingsStore } from "@/state/settingsStore";
import type { ChatMessage } from "@/types/models";
import type { ChatRelayPayload } from "@/types/protocol";

const persistRuntime = vi.fn(async () => undefined);
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
  persistRuntime: (...args: unknown[]) => persistRuntime(...args),
  pollMempoolRuntime: async () => false,
  syncRuntime: async () => 0,
}));

import * as holepunch from "@/services/p2p/HolepunchChatTransport";
import {
  __resetHolepunchTransport,
  __seedRoomMessagesForTests,
  getMessagesForRoom,
  HolepunchChatTransport,
  hydrateChatRoomsFromWallet,
  ingestChatRelay,
  relayMessageId,
  saveChatRoomsToWallet,
} from "@/services/p2p/HolepunchChatTransport";
import {
  __setHolepunchSidecarBackend,
  createMemorySidecarBackend,
} from "@/services/p2p/HolepunchSidecarClient";
import {
  encodeRelaySmartBody,
  parseChatSmartBody,
} from "@/services/protocol/SmartMessageProtocolAdapter";

const FROZEN_MS = Date.UTC(2026, 8, 2, 21, 30, 0);
const SIX_MIN_SEC = 6 * 60;
const ROOM_ID = "room-ttl-erase";
const INBOUND_ROOM_ID = "room-ttl-inbound";
const PAYMENT_ID_FROM = "pid-from";

function frozenNowSec(): number {
  return Math.floor(FROZEN_MS / 1000);
}

function emptyRaw(): RawWalletV1 {
  return {
    deposits: [],
    withdrawals: [],
    transactions: [],
    lastHeight: 0,
    nonce: "",
  };
}

function sdkRecord(
  id: string,
  body: string,
  direction: SdkMessageRecord["direction"] = "sent",
  extras: Partial<SdkMessageRecord> = {},
): SdkMessageRecord {
  return {
    id,
    direction,
    counterpartyAddress: "ccxPeer",
    counterpartyName: "Peer",
    body,
    hasBody: true,
    paymentIdFrom: direction === "received" ? "pid-from" : null,
    paymentIdTo: direction === "sent" ? "pid-to" : null,
    timestamp: "2026-01-01T00:00:00.000Z",
    unread: false,
    blockHeight: 100,
    threadKey: "thread",
    ...extras,
  };
}

function roomMessage(
  id: string,
  text: string,
  direction: ChatMessage["direction"],
  extras: Pick<ChatMessage, "ttlExpiresAt"> = {},
): ChatMessage {
  return {
    id,
    roomId: ROOM_ID,
    direction,
    text,
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "delivered",
    channel: "relay",
    ...extras,
  };
}

/** Encode L1′ relay and require parse to yield chat.relay. */
function relayBody(roomId: string, sentAt: number, text: string): string {
  const body = encodeRelaySmartBody({
    type: "chat.relay",
    roomId,
    sentAt,
    text,
  });
  const parsed = parseChatSmartBody(body);
  if (parsed?.action !== "relay") {
    throw new Error("fixture: expected chat.relay body");
  }
  if (parsed.payload.roomId !== roomId || parsed.payload.text !== text) {
    throw new Error("fixture: relay parse mismatch");
  }
  return body;
}

function blobTexts(roomId: string): string[] {
  const entry = readChatRooms(raw)[roomId];
  return entry && "messages" in entry ? entry.messages.map((m) => m.text) : [];
}

function blobTextsFrom(rawWallet: RawWalletV1, roomId: string): string[] {
  const entry = readChatRooms(rawWallet)[roomId];
  return entry && "messages" in entry ? entry.messages.map((m) => m.text) : [];
}

/** Wished-for 3.2 export — assertions fail until it prunes. */
function pruneExpiredTtlRoomMessages(nowUnix: number): void {
  const fn = (
    holepunch as {
      pruneExpiredTtlRoomMessages?: (now: number) => void;
    }
  ).pruneExpiredTtlRoomMessages;
  if (typeof fn === "function") {
    fn(nowUnix);
  }
}

/** ingestChatRelay second arg is missing today — stamp must fail on a no-op. */
function ingestRelay(
  relay: ChatRelayPayload,
  ttlExpiresAt?: number,
): Promise<ChatMessage | null> {
  return (
    ingestChatRelay as (
      payload: ChatRelayPayload,
      ttl?: number,
    ) => Promise<ChatMessage | null>
  )(relay, ttlExpiresAt);
}

async function createAcceptedRoom(roomId: string): Promise<void> {
  await HolepunchChatTransport.createRoom({
    contactId: "c-ttl-inbound",
    bootstrap: {
      roomId,
      roomKeyRef: `key:${roomId}`,
      bootstrapSource: "conceal-smart-message",
      lifecycleStatus: "accepted",
    },
  });
}

function bindKnownPaymentId(): void {
  bindSmartMessageContacts({
    resolve: () => ({
      contactId: "c-ttl-inbound",
      address: "ccxPeer",
      paymentIdFrom: PAYMENT_ID_FROM,
      paymentIdTo: "pid-to",
      alias: "Peer",
    }),
    list: () => [
      {
        contactId: "c-ttl-inbound",
        address: "ccxPeer",
        paymentIdFrom: PAYMENT_ID_FROM,
        paymentIdTo: "pid-to",
        alias: "Peer",
      },
    ],
  });
}

describe("L1′ TTL erase", () => {
  beforeEach(() => {
    raw = emptyRaw();
    persistRuntime.mockClear();
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
    __resetSmartMessageDelivery();
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
    __resetHolepunchTransport();
    __resetSmartMessageDelivery();
    useChatStore.setState({
      rooms: [],
      messagesByRoom: {},
      activeRoomId: null,
    });
  });

  it("pruneExpiredTtlRoomMessages drops expired in and out, keeps durable", () => {
    const nowUnix = frozenNowSec();
    const expiredAt = nowUnix - SIX_MIN_SEC;
    const liveTtlAt = nowUnix + SIX_MIN_SEC;
    const expiredOutText = "expired-out-unique";
    const expiredInText = "expired-in-unique";
    const durableText = "durable-no-ttl-unique";
    const liveTtlText = "live-ttl-still-valid";

    __seedRoomMessagesForTests(ROOM_ID, [
      roomMessage("ttl-out-expired", expiredOutText, "out", {
        ttlExpiresAt: expiredAt,
      }),
      roomMessage("ttl-in-expired", expiredInText, "in", {
        ttlExpiresAt: expiredAt,
      }),
      roomMessage("durable-keep", durableText, "out"),
      roomMessage("ttl-live", liveTtlText, "in", { ttlExpiresAt: liveTtlAt }),
    ]);

    pruneExpiredTtlRoomMessages(nowUnix);

    const texts = getMessagesForRoom(ROOM_ID).map((m) => m.text);
    expect(texts).toContain(durableText);
    expect(texts).toContain(liveTtlText);
    expect(texts).not.toContain(expiredOutText);
    expect(texts).not.toContain(expiredInText);
    expect(expiredAt).toBeLessThan(nowUnix);
    expect(liveTtlAt).toBeGreaterThan(nowUnix);
    expect(expiredOutText).not.toBe(expiredInText);
    expect(durableText).not.toBe(liveTtlText);
  });

  it("saveActiveMessages omits TTL rows and keeps durable", () => {
    const nowUnix = frozenNowSec();
    const liveTtlAt = nowUnix + SIX_MIN_SEC;
    const durableText = "persist-durable-unique";
    const ttlOutText = "persist-ttl-out-unique";
    const ttlInText = "persist-ttl-in-unique";
    const durable = roomMessage("persist-durable", durableText, "out");
    const ttlOut = roomMessage("persist-ttl-out", ttlOutText, "out", {
      ttlExpiresAt: liveTtlAt,
    });
    const ttlIn = roomMessage("persist-ttl-in", ttlInText, "in", {
      ttlExpiresAt: liveTtlAt,
    });

    const next = saveActiveMessages(emptyRaw(), {
      [ROOM_ID]: [durable, ttlOut, ttlIn],
    });
    const texts = blobTextsFrom(next, ROOM_ID);
    expect(texts).toContain(durableText);
    expect(texts).not.toContain(ttlOutText);
    expect(texts).not.toContain(ttlInText);
    expect(ttlOut.ttlExpiresAt).toBe(liveTtlAt);
    expect(ttlIn.ttlExpiresAt).toBe(liveTtlAt);
    expect(durable.ttlExpiresAt).toBeUndefined();
  });

  it("saveChatRoomsToWallet omits TTL rows and keeps durable", async () => {
    const nowUnix = frozenNowSec();
    const liveTtlAt = nowUnix + SIX_MIN_SEC;
    const durableText = "wallet-durable-unique";
    const ttlOutText = "wallet-ttl-out-unique";
    const ttlInText = "wallet-ttl-in-unique";

    __seedRoomMessagesForTests(ROOM_ID, [
      roomMessage("wallet-durable", durableText, "out"),
      roomMessage("wallet-ttl-out", ttlOutText, "out", {
        ttlExpiresAt: liveTtlAt,
      }),
      roomMessage("wallet-ttl-in", ttlInText, "in", {
        ttlExpiresAt: liveTtlAt,
      }),
    ]);
    await saveChatRoomsToWallet();

    const texts = blobTexts(ROOM_ID);
    expect(texts).toContain(durableText);
    expect(texts).not.toContain(ttlOutText);
    expect(texts).not.toContain(ttlInText);
    expect(persistRuntime).toHaveBeenCalled();
  });

  it("hydrateChatRoomsFromWallet does not restore expired TTL, keeps durable", () => {
    const nowUnix = frozenNowSec();
    const expiredAt = nowUnix - SIX_MIN_SEC;
    const liveTtlAt = nowUnix + SIX_MIN_SEC;
    const sentAt = nowUnix - 180;
    const expiredOutText = "hydrate-expired-out-unique";
    const expiredInText = "hydrate-expired-in-unique";
    const durableText = "hydrate-durable-unique";
    const liveTtlText = "hydrate-live-ttl-unique";

    const expiredOutBody = relayBody(ROOM_ID, sentAt, expiredOutText);
    const expiredInBody = relayBody(ROOM_ID, sentAt + 1, expiredInText);
    const durableBody = relayBody(ROOM_ID, sentAt + 2, durableText);
    const liveTtlBody = relayBody(ROOM_ID, sentAt + 3, liveTtlText);
    const expiredOutParsed = parseChatSmartBody(expiredOutBody);
    const expiredInParsed = parseChatSmartBody(expiredInBody);
    const durableParsed = parseChatSmartBody(durableBody);
    const liveTtlParsed = parseChatSmartBody(liveTtlBody);
    if (
      expiredOutParsed?.action !== "relay" ||
      expiredInParsed?.action !== "relay" ||
      durableParsed?.action !== "relay" ||
      liveTtlParsed?.action !== "relay"
    ) {
      throw new Error("fixture: relay parse");
    }

    raw = withSentRecords(raw, [
      sdkRecord("tx-expired-out", expiredOutBody, "sent", {
        ttlExpiresAt: expiredAt,
        blockHeight: 0,
      }),
      sdkRecord("tx-durable", durableBody, "sent"),
      sdkRecord("tx-live-ttl", liveTtlBody, "sent", {
        ttlExpiresAt: liveTtlAt,
        blockHeight: 0,
      }),
    ]);
    raw = withReceivedRecords(raw, [
      sdkRecord("tx-expired-in", expiredInBody, "received", {
        ttlExpiresAt: expiredAt,
        blockHeight: 0,
      }),
    ]);

    hydrateChatRoomsFromWallet();

    const restored = getMessagesForRoom(ROOM_ID);
    const texts = restored.map((m) => m.text);
    expect(texts).toContain(durableParsed.payload.text);
    expect(texts).toContain(liveTtlParsed.payload.text);
    expect(texts).not.toContain(expiredOutParsed.payload.text);
    expect(texts).not.toContain(expiredInParsed.payload.text);
    expect(
      restored.find((m) => m.text === durableParsed.payload.text)?.id,
    ).toBe(
      relayMessageId(
        durableParsed.payload.roomId,
        durableParsed.payload.sentAt,
        durableParsed.payload.text,
      ),
    );
    expect(expiredAt).toBeLessThan(nowUnix);
    expect(liveTtlAt).toBeGreaterThan(nowUnix);
  });

  it("ingestChatRelay refuses an already-expired ttlExpiresAt", async () => {
    const nowUnix = frozenNowSec();
    const expiredAt = nowUnix - 1;
    const expiredText = "inbound-ttl-already-expired-unique";
    await createAcceptedRoom(INBOUND_ROOM_ID);

    const expiredMsg = await ingestRelay(
      {
        type: "chat.relay",
        roomId: INBOUND_ROOM_ID,
        sentAt: nowUnix - 10,
        text: expiredText,
      },
      expiredAt,
    );

    expect(expiredAt).toBeLessThan(nowUnix);
    expect(expiredMsg).toBeNull();
    expect(
      getMessagesForRoom(INBOUND_ROOM_ID).some((m) => m.text === expiredText),
    ).toBe(false);
  });

  it("ingestChatRelay stamps inbound ttlExpiresAt and leaves durable inbound unmarked", async () => {
    const nowUnix = frozenNowSec();
    const liveTtlAt = nowUnix + SIX_MIN_SEC;
    const ttlText = "inbound-ttl-stamped-unique";
    const durableText = "inbound-durable-no-ttl-unique";
    await createAcceptedRoom(INBOUND_ROOM_ID);

    const ttlMsg = await ingestRelay(
      {
        type: "chat.relay",
        roomId: INBOUND_ROOM_ID,
        sentAt: nowUnix - 10,
        text: ttlText,
      },
      liveTtlAt,
    );
    const durableMsg = await ingestRelay({
      type: "chat.relay",
      roomId: INBOUND_ROOM_ID,
      sentAt: nowUnix - 9,
      text: durableText,
    });

    expect(ttlText).not.toBe(durableText);
    expect(ttlMsg?.text).toBe(ttlText);
    expect(durableMsg?.text).toBe(durableText);
    expect(ttlMsg?.ttlExpiresAt).toBe(liveTtlAt);
    expect(durableMsg?.ttlExpiresAt).toBeUndefined();
    const restored = getMessagesForRoom(INBOUND_ROOM_ID);
    expect(restored.find((m) => m.text === ttlText)?.ttlExpiresAt).toBe(
      liveTtlAt,
    );
    expect(
      restored.find((m) => m.text === durableText)?.ttlExpiresAt,
    ).toBeUndefined();
  });

  it("saveActiveMessages omits stamped inbound TTL and keeps durable inbound", async () => {
    const nowUnix = frozenNowSec();
    const liveTtlAt = nowUnix + SIX_MIN_SEC;
    const ttlText = "persist-inbound-ttl-unique";
    const durableText = "persist-inbound-durable-unique";
    await createAcceptedRoom(INBOUND_ROOM_ID);

    const ttlMsg = await ingestRelay(
      {
        type: "chat.relay",
        roomId: INBOUND_ROOM_ID,
        sentAt: nowUnix - 8,
        text: ttlText,
      },
      liveTtlAt,
    );
    const durableMsg = await ingestRelay({
      type: "chat.relay",
      roomId: INBOUND_ROOM_ID,
      sentAt: nowUnix - 7,
      text: durableText,
    });
    expect(ttlMsg?.ttlExpiresAt).toBe(liveTtlAt);
    expect(durableMsg?.ttlExpiresAt).toBeUndefined();
    expect(ttlText).not.toBe(durableText);

    const next = saveActiveMessages(emptyRaw(), {
      [INBOUND_ROOM_ID]: getMessagesForRoom(INBOUND_ROOM_ID),
    });
    const texts = blobTextsFrom(next, INBOUND_ROOM_ID);
    expect(texts).toContain(durableText);
    expect(texts).not.toContain(ttlText);
  });

  it("hydrate keeps live inbound ttlExpiresAt and skips expired inbound", () => {
    const nowUnix = frozenNowSec();
    const expiredAt = nowUnix - SIX_MIN_SEC;
    const liveTtlAt = nowUnix + SIX_MIN_SEC;
    const sentAt = nowUnix - 180;
    const expiredText = "hydrate-inbound-expired-unique";
    const liveText = "hydrate-inbound-live-unique";
    const durableText = "hydrate-inbound-durable-unique";

    raw = withReceivedRecords(raw, [
      sdkRecord(
        "tx-in-expired",
        relayBody(ROOM_ID, sentAt, expiredText),
        "received",
        {
          ttlExpiresAt: expiredAt,
          blockHeight: 0,
        },
      ),
      sdkRecord(
        "tx-in-live",
        relayBody(ROOM_ID, sentAt + 1, liveText),
        "received",
        { ttlExpiresAt: liveTtlAt, blockHeight: 0 },
      ),
      sdkRecord(
        "tx-in-durable",
        relayBody(ROOM_ID, sentAt + 2, durableText),
        "received",
      ),
    ]);

    hydrateChatRoomsFromWallet();

    const restored = getMessagesForRoom(ROOM_ID);
    const live = restored.find((m) => m.text === liveText);
    const durable = restored.find((m) => m.text === durableText);
    expect(expiredText).not.toBe(liveText);
    expect(liveText).not.toBe(durableText);
    expect(restored.map((m) => m.text)).not.toContain(expiredText);
    expect(live?.ttlExpiresAt).toBe(liveTtlAt);
    expect(durable?.ttlExpiresAt).toBeUndefined();
    expect(expiredAt).toBeLessThan(nowUnix);
    expect(liveTtlAt).toBeGreaterThan(nowUnix);
  });

  it("blob hydrate omits all ttlExpiresAt rows; live TTL comes from sent merge only", () => {
    const nowUnix = frozenNowSec();
    const liveTtlAt = nowUnix + SIX_MIN_SEC;
    const sentAt = nowUnix - 90;
    const blobLiveText = "blob-live-ttl-must-not-hydrate";
    const blobDurableText = "blob-durable-must-hydrate";
    const mergeLiveText = "merge-live-ttl-from-sent";

    raw = withChatRooms(emptyRaw(), {
      [ROOM_ID]: {
        roomId: ROOM_ID,
        revoked: false,
        messages: [
          roomMessage("blob-durable", blobDurableText, "out"),
          roomMessage("blob-live-ttl", blobLiveText, "in", {
            ttlExpiresAt: liveTtlAt,
          }),
        ],
      },
    });
    raw = withSentRecords(raw, [
      sdkRecord(
        "tx-merge-live",
        relayBody(ROOM_ID, sentAt, mergeLiveText),
        "sent",
        {
          ttlExpiresAt: liveTtlAt,
          blockHeight: 0,
        },
      ),
    ]);

    hydrateChatRoomsFromWallet();

    const texts = getMessagesForRoom(ROOM_ID).map((m) => m.text);
    expect(blobLiveText).not.toBe(blobDurableText);
    expect(blobLiveText).not.toBe(mergeLiveText);
    expect(texts).toContain(blobDurableText);
    expect(texts).toContain(mergeLiveText);
    expect(texts).not.toContain(blobLiveText);
    expect(
      getMessagesForRoom(ROOM_ID).find((m) => m.text === mergeLiveText)
        ?.ttlExpiresAt,
    ).toBe(liveTtlAt);
    expect(liveTtlAt).toBeGreaterThan(nowUnix);
  });

  it("pruneExpiredTtlRoomMessages replaces the sitting thread so the bubble drops", () => {
    const nowUnix = frozenNowSec();
    const expiredAt = nowUnix - SIX_MIN_SEC;
    const expiredText = "sitting-expired-unique";
    const durableText = "sitting-durable-unique";
    const seeded = [
      roomMessage("sitting-expired", expiredText, "in", {
        ttlExpiresAt: expiredAt,
      }),
      roomMessage("sitting-durable", durableText, "out"),
    ];
    __seedRoomMessagesForTests(ROOM_ID, seeded);
    useChatStore.setState({
      messagesByRoom: { [ROOM_ID]: getMessagesForRoom(ROOM_ID) },
    });
    const unsub = useChatStore.getState().subscribeRoom(ROOM_ID);

    pruneExpiredTtlRoomMessages(nowUnix);

    const sitting = useChatStore.getState().messagesByRoom[ROOM_ID] ?? [];
    const texts = sitting.map((m) => m.text);
    expect(expiredText).not.toBe(durableText);
    expect(texts).toContain(durableText);
    expect(texts).not.toContain(expiredText);
    expect(expiredAt).toBeLessThan(nowUnix);
    unsub();
  });

  it("fetchIncomingRelays and refreshRelays stamp inbound ttlExpiresAt", async () => {
    const nowUnix = frozenNowSec();
    const liveTtlAt = nowUnix + SIX_MIN_SEC;
    const ttlText = "refresh-inbound-ttl-unique";
    const durableText = "refresh-inbound-durable-unique";
    await createAcceptedRoom(INBOUND_ROOM_ID);
    bindKnownPaymentId();

    raw = withReceivedRecords(emptyRaw(), [
      sdkRecord(
        "tx-refresh-ttl",
        relayBody(INBOUND_ROOM_ID, nowUnix - 5, ttlText),
        "received",
        { ttlExpiresAt: liveTtlAt, blockHeight: 0 },
      ),
      sdkRecord(
        "tx-refresh-durable",
        relayBody(INBOUND_ROOM_ID, nowUnix - 4, durableText),
        "received",
      ),
    ]);

    const inbound = await ConcealSmartMessageAdapter.fetchIncomingRelays();
    const ttlRow = inbound.find((row) => row.relay.text === ttlText) as
      | { ttlExpiresAt?: number }
      | undefined;
    const durableRow = inbound.find((row) => row.relay.text === durableText) as
      | { ttlExpiresAt?: number }
      | undefined;
    expect(ttlText).not.toBe(durableText);
    expect(ttlRow?.ttlExpiresAt).toBe(liveTtlAt);
    expect(durableRow?.ttlExpiresAt).toBeUndefined();

    await useChatStore.getState().refreshRelays();

    const restored = getMessagesForRoom(INBOUND_ROOM_ID);
    expect(restored.find((m) => m.text === ttlText)?.ttlExpiresAt).toBe(
      liveTtlAt,
    );
    expect(
      restored.find((m) => m.text === durableText)?.ttlExpiresAt,
    ).toBeUndefined();
  });
});
