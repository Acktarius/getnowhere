import type { RawWalletV1 } from "conceal-wallet-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readChatRooms } from "@/services/p2p/chatRoomsBlob";
import { isRoomRevoked } from "@/services/p2p/revokedRoomsStore";
import { setActiveStorageAdapter } from "@/services/storage/StorageAdapter";

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
  saveChatRoomsToWallet,
} from "@/services/p2p/HolepunchChatTransport";
import {
  __setHolepunchSidecarBackend,
  createMemorySidecarBackend,
} from "@/services/p2p/HolepunchSidecarClient";

describe("chat room wallet save / hydrate", () => {
  beforeEach(() => {
    raw = {
      deposits: [],
      withdrawals: [],
      transactions: [],
      lastHeight: 0,
      nonce: "",
    };
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
});
