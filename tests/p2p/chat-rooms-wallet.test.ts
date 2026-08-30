import type { RawWalletV1 } from "conceal-wallet-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readReceivedRecords,
  readSentRecords,
  type SdkMessageRecord,
  withReceivedRecords,
  withSentRecords,
} from "@/services/conceal/sync/messages-store";
import { readChatRooms } from "@/services/p2p/chatRoomsBlob";
import { isRoomRevoked } from "@/services/p2p/revokedRoomsStore";
import { setActiveStorageAdapter } from "@/services/storage/StorageAdapter";
import { useSettingsStore } from "@/state/settingsStore";
import type { ChatMessage } from "@/types/models";
import type { ChatInviteHandshake } from "@/types/protocol";

const persistRuntime = vi.fn(async () => undefined);
let raw: RawWalletV1 = {
  deposits: [],
  withdrawals: [],
  transactions: [],
  lastHeight: 0,
  nonce: "",
};

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
  persistRuntime: (...args: unknown[]) => persistRuntime(...args),
}));

import {
  __resetHolepunchTransport,
  __seedRoomMessagesForTests,
  getMessagesForRoom,
  HolepunchChatTransport,
  hydrateChatRoomsFromWallet,
  relayMessageId,
  saveChatRoomsToWallet,
} from "@/services/p2p/HolepunchChatTransport";
import {
  __setHolepunchSidecarBackend,
  createMemorySidecarBackend,
} from "@/services/p2p/HolepunchSidecarClient";
import {
  encodeCreateSmartBody,
  encodeRegisterSmartBody,
  encodeRelaySmartBody,
  encodeRevokeSmartBody,
  parseChatSmartBody,
} from "@/services/protocol/SmartMessageProtocolAdapter";

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
  };
}

function liveMessage(roomId: string, id: string, text: string): ChatMessage {
  return {
    id,
    roomId,
    direction: "out",
    text,
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "delivered",
    channel: "live",
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

describe("chat room wallet save / hydrate", () => {
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
  });

  it("saveChatRoomsToWallet writes messages into raw.chatRooms", async () => {
    const room = await HolepunchChatTransport.createRoom({
      contactId: "c1",
      bootstrap: {
        roomId: "room-save-1",
        roomKeyRef: "key:room-save-1",
        bootstrapSource: "conceal-smart-message",
        lifecycleStatus: "accepted",
      },
    });
    __seedRoomMessagesForTests(room.id, [
      {
        id: "m1",
        roomId: room.id,
        direction: "out",
        text: "hello",
        createdAt: "2026-01-01T00:00:00.000Z",
        status: "delivered",
      },
    ]);
    await saveChatRoomsToWallet();
    const entry = readChatRooms(raw)[room.id];
    expect(entry && "messages" in entry ? entry.messages[0]?.text : null).toBe(
      "hello",
    );
    expect(persistRuntime).toHaveBeenCalled();
  });

  it("hydrateChatRoomsFromWallet restores messages and revoked stubs", async () => {
    raw = {
      ...raw,
      chatRooms: {
        "room-h1": {
          roomId: "room-h1",
          revoked: false,
          messages: [
            {
              id: "m1",
              roomId: "room-h1",
              direction: "in",
              text: "hi",
              createdAt: "2026-01-01T00:00:00.000Z",
              status: "delivered",
            },
          ],
        },
        "room-dead": { roomId: "room-dead", revoked: true },
      },
    };
    hydrateChatRoomsFromWallet();
    expect(getMessagesForRoom("room-h1").map((m) => m.text)).toEqual(["hi"]);
    expect(isRoomRevoked("room-dead")).toBe(true);
  });

  it("leaveRoom writes revoked tombstone only", async () => {
    const room = await HolepunchChatTransport.createRoom({
      contactId: "c1",
      bootstrap: {
        roomId: "room-tomb-1",
        roomKeyRef: "key:room-tomb-1",
        bootstrapSource: "conceal-smart-message",
        lifecycleStatus: "accepted",
      },
    });
    __seedRoomMessagesForTests(room.id, [
      {
        id: "m1",
        roomId: room.id,
        direction: "out",
        text: "gone",
        createdAt: "2026-01-01T00:00:00.000Z",
        status: "delivered",
      },
    ]);
    await HolepunchChatTransport.leaveRoom(room.id);
    expect(readChatRooms(raw)[room.id]).toEqual({
      roomId: room.id,
      revoked: true,
    });
    expect(isRoomRevoked(room.id)).toBe(true);
    expect(getMessagesForRoom(room.id)).toEqual([]);
  });

  it("saveChatRoomsToWallet no-ops when localMessageRetention is false", async () => {
    const room = await HolepunchChatTransport.createRoom({
      contactId: "c1",
      bootstrap: {
        roomId: "room-ret-off-save",
        roomKeyRef: "key:room-ret-off-save",
        bootstrapSource: "conceal-smart-message",
        lifecycleStatus: "accepted",
      },
    });
    const liveText = "live-must-not-persist";
    __seedRoomMessagesForTests(room.id, [
      liveMessage(room.id, "m-live-off", liveText),
    ]);
    persistRuntime.mockClear();
    const chatRoomsBefore = JSON.stringify(readChatRooms(raw));
    useSettingsStore.getState().setPrivacy({ localMessageRetention: false });
    await saveChatRoomsToWallet();
    expect(JSON.stringify(readChatRooms(raw))).toBe(chatRoomsBefore);
    expect(blobTexts(room.id)).not.toContain(liveText);
    expect(persistRuntime).not.toHaveBeenCalled();
  });

  it("hydrateChatRoomsFromWallet with retention off restores L1′ sent/received not live rows", () => {
    const roomId = "room-ret-off-hydrate";
    const liveText = "live-must-not-hydrate";
    const l1SentText = "l1-sent-unique-hydrate";
    const l1RecvText = "l1-recv-unique-hydrate";
    const sentAt = 1_700_100_000;
    const recvAt = sentAt + 60;
    const sentBody = relayBody(roomId, sentAt, l1SentText);
    const recvBody = relayBody(roomId, recvAt, l1RecvText);
    const sentParsed = parseChatSmartBody(sentBody);
    const recvParsed = parseChatSmartBody(recvBody);
    if (sentParsed?.action !== "relay" || recvParsed?.action !== "relay") {
      throw new Error("fixture: relay parse");
    }

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
    raw = withSentRecords(raw, [sdkRecord("tx-sent-h", sentBody, "sent")]);
    raw = withReceivedRecords(raw, [
      sdkRecord("tx-recv-h", recvBody, "received"),
    ]);

    useSettingsStore.getState().setPrivacy({ localMessageRetention: false });
    hydrateChatRoomsFromWallet();

    const restored = getMessagesForRoom(roomId);
    const texts = restored.map((m) => m.text);
    expect(texts).not.toContain(liveText);
    expect(restored.some((m) => m.channel === "live")).toBe(false);
    expect(texts).toContain(sentParsed.payload.text);
    expect(texts).toContain(recvParsed.payload.text);

    const sentMsg = restored.find((m) => m.text === sentParsed.payload.text);
    expect(sentMsg?.channel).toBe("relay");
    expect(sentMsg?.direction).toBe("out");
    expect(sentMsg?.id).toBe(
      relayMessageId(
        sentParsed.payload.roomId,
        sentParsed.payload.sentAt,
        sentParsed.payload.text,
      ),
    );

    const recvMsg = restored.find((m) => m.text === recvParsed.payload.text);
    expect(recvMsg?.channel).toBe("relay");
    expect(recvMsg?.direction).toBe("in");
    expect(recvMsg?.id).toBe(
      relayMessageId(
        recvParsed.payload.roomId,
        recvParsed.payload.sentAt,
        recvParsed.payload.text,
      ),
    );
  });

  it("leaveRoom drops matching L1′ relay rows and keeps create/register/revoke", async () => {
    const room = await HolepunchChatTransport.createRoom({
      contactId: "c1",
      bootstrap: {
        roomId: "room-prune-relay",
        roomKeyRef: "key:room-prune-relay",
        bootstrapSource: "conceal-smart-message",
        lifecycleStatus: "accepted",
      },
    });
    const otherRoomId = "room-other-keep";
    const dropSentText = "drop-sent-relay";
    const dropRecvText = "drop-recv-relay";
    const keepOtherText = "other-room-relay-stays";
    const sentAt = 1_700_200_000;
    const dropSentBody = relayBody(room.id, sentAt, dropSentText);
    const dropRecvBody = relayBody(room.id, sentAt + 1, dropRecvText);
    const keepOtherBody = relayBody(otherRoomId, sentAt + 2, keepOtherText);
    const keepCreate = encodeCreateSmartBody(sampleHandshake());
    const keepRegister = encodeRegisterSmartBody({
      type: "chat.register",
      inviteId: "aabbccdd",
      receiverEphemeralPublicKey: "11".repeat(32),
      replayId: "44".repeat(8),
    });
    const keepRevoke = encodeRevokeSmartBody({
      type: "chat.revoke",
      inviteId: "a1b2c3d4",
      replayId: "1122334455667788",
      reasonCode: "room_revoked",
      roomId: room.id,
    });
    const keeperBodies = [keepCreate, keepRegister, keepRevoke, keepOtherBody];
    const droppedBodies = [dropSentBody, dropRecvBody];

    raw = withSentRecords(raw, [
      sdkRecord("s-create", keepCreate),
      sdkRecord("s-register", keepRegister),
      sdkRecord("s-revoke", keepRevoke),
      sdkRecord("s-relay-drop", dropSentBody),
      sdkRecord("s-relay-other", keepOtherBody),
    ]);
    raw = withReceivedRecords(raw, [
      sdkRecord("r-relay-drop", dropRecvBody, "received"),
    ]);

    await HolepunchChatTransport.leaveRoom(room.id);

    expect(readChatRooms(raw)[room.id]).toEqual({
      roomId: room.id,
      revoked: true,
    });
    const remainingBodies = [
      ...readSentRecords(raw),
      ...readReceivedRecords(raw),
    ].map((r) => r.body);
    for (const body of keeperBodies) {
      expect(remainingBodies).toContain(body);
    }
    for (const body of droppedBodies) {
      expect(remainingBodies).not.toContain(body);
    }
  });

  it("hydrateChatRoomsFromWallet merges live and L1′ without duplicate ids", () => {
    const roomId = "room-merge-1";
    const liveUniqueText = "live-unique-merge";
    const liveWinsText = "live-keeps-this";
    const l1DupText = "l1-discarded-dup";
    const l1SentUniqueText = "l1-sent-unique-merge";
    const l1RecvUniqueText = "l1-recv-unique-merge";
    const dupSentAt = 1_700_300_000;
    const sentAt = dupSentAt + 10;
    const recvAt = dupSentAt + 20;
    const l1DupBody = relayBody(roomId, dupSentAt, l1DupText);
    const l1SentBody = relayBody(roomId, sentAt, l1SentUniqueText);
    const l1RecvBody = relayBody(roomId, recvAt, l1RecvUniqueText);
    const dupParsed = parseChatSmartBody(l1DupBody);
    const sentParsed = parseChatSmartBody(l1SentBody);
    const recvParsed = parseChatSmartBody(l1RecvBody);
    if (
      dupParsed?.action !== "relay" ||
      sentParsed?.action !== "relay" ||
      recvParsed?.action !== "relay"
    ) {
      throw new Error("fixture: relay parse");
    }
    const dupId = relayMessageId(
      dupParsed.payload.roomId,
      dupParsed.payload.sentAt,
      dupParsed.payload.text,
    );
    const liveUniqueId = "live-unique-id";
    const expectedTexts = [
      liveUniqueText,
      liveWinsText,
      sentParsed.payload.text,
      recvParsed.payload.text,
    ];

    raw = {
      ...raw,
      chatRooms: {
        [roomId]: {
          roomId,
          revoked: false,
          messages: [
            liveMessage(roomId, liveUniqueId, liveUniqueText),
            liveMessage(roomId, dupId, liveWinsText),
          ],
        },
      },
    };
    raw = withSentRecords(raw, [
      sdkRecord("tx-dup", l1DupBody, "sent"),
      sdkRecord("tx-sent-m", l1SentBody, "sent"),
    ]);
    raw = withReceivedRecords(raw, [
      sdkRecord("tx-recv-m", l1RecvBody, "received"),
    ]);

    hydrateChatRoomsFromWallet();

    const restored = getMessagesForRoom(roomId);
    const texts = restored.map((m) => m.text);
    const ids = restored.map((m) => m.id);
    expect(texts).toEqual(expect.arrayContaining(expectedTexts));
    expect(texts).not.toContain(dupParsed.payload.text);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id === dupId)).toHaveLength(1);
    expect(restored.find((m) => m.id === dupId)?.text).toBe(liveWinsText);
  });

  it("hydrateChatRoomsFromWallet revoked tombstone blocks L1′ re-seed", () => {
    const availableRoomId = "room-avail-reseed";
    const revokedRoomId = "room-dead-reseed";
    const availableText = "available-l1-shows";
    const revokedText = "revoked-must-not-reseed";
    const sentAt = 1_700_400_000;
    const availableBody = relayBody(availableRoomId, sentAt, availableText);
    const revokedBody = relayBody(revokedRoomId, sentAt + 1, revokedText);
    const availableParsed = parseChatSmartBody(availableBody);
    const revokedParsed = parseChatSmartBody(revokedBody);
    if (
      availableParsed?.action !== "relay" ||
      revokedParsed?.action !== "relay"
    ) {
      throw new Error("fixture: relay parse");
    }

    raw = {
      ...raw,
      chatRooms: {
        [availableRoomId]: {
          roomId: availableRoomId,
          revoked: false,
          messages: [],
        },
        [revokedRoomId]: { roomId: revokedRoomId, revoked: true },
      },
    };
    raw = withSentRecords(raw, [
      sdkRecord("tx-avail", availableBody, "sent"),
      sdkRecord("tx-revoked", revokedBody, "sent"),
    ]);

    hydrateChatRoomsFromWallet();

    expect(getMessagesForRoom(availableRoomId).map((m) => m.text)).toContain(
      availableParsed.payload.text,
    );
    expect(getMessagesForRoom(revokedRoomId).map((m) => m.text)).not.toContain(
      revokedParsed.payload.text,
    );
    expect(isRoomRevoked(revokedRoomId)).toBe(true);
  });
});
