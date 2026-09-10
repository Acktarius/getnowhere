import type { RawWalletV1 } from "conceal-wallet-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readChatRooms } from "@/services/p2p/chatRoomsBlob";
import { setActiveStorageAdapter } from "@/services/storage/StorageAdapter";
import { useSettingsStore } from "@/state/settingsStore";
import type { ChatMessage } from "@/types/models";

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
  flushChatTranscriptsOnHide,
  HolepunchChatTransport,
  scheduleLiveTranscriptFlush,
} from "@/services/p2p/HolepunchChatTransport";
import {
  __setHolepunchSidecarBackend,
  createMemorySidecarBackend,
} from "@/services/p2p/HolepunchSidecarClient";

/** Design coalesce window for L2 persist after live send/receive. */
const LIVE_FLUSH_COALESCE_MS = 1000;

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

function blobTexts(roomId: string): string[] {
  const entry = readChatRooms(raw)[roomId];
  return entry && "messages" in entry ? entry.messages.map((m) => m.text) : [];
}

async function openSeededRoom(roomId: string, text: string): Promise<string> {
  const room = await HolepunchChatTransport.createRoom({
    contactId: "c1",
    bootstrap: {
      roomId,
      roomKeyRef: `key:${roomId}`,
      bootstrapSource: "conceal-smart-message",
      lifecycleStatus: "accepted",
    },
  });
  __seedRoomMessagesForTests(room.id, [
    liveMessage(room.id, `m-${roomId}`, text),
  ]);
  return room.id;
}

describe("chat transcript hide / debounce flush", () => {
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
    useSettingsStore.getState().setPrivacy({ localMessageRetention: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    useSettingsStore.getState().setPrivacy({ localMessageRetention: true });
  });

  it("flushChatTranscriptsOnHide writes live messages when retention is on", async () => {
    const liveText = "hide-live-on";
    const roomId = await openSeededRoom("room-hide-on", liveText);
    persistRuntime.mockClear();
    await flushChatTranscriptsOnHide();
    expect(blobTexts(roomId)).toContain(liveText);
    expect(persistRuntime).toHaveBeenCalled();
  });

  it("flushChatTranscriptsOnHide does not write live messages when retention is off", async () => {
    const liveText = "hide-live-off";
    const roomId = await openSeededRoom("room-hide-off", liveText);
    persistRuntime.mockClear();
    const chatRoomsBefore = JSON.stringify(readChatRooms(raw));
    useSettingsStore.getState().setPrivacy({ localMessageRetention: false });
    await flushChatTranscriptsOnHide();
    expect(JSON.stringify(readChatRooms(raw))).toBe(chatRoomsBefore);
    expect(blobTexts(roomId)).not.toContain(liveText);
    expect(persistRuntime).not.toHaveBeenCalled();
  });

  it("scheduleLiveTranscriptFlush writes L2 after coalesce when retention is on", async () => {
    const liveText = "debounce-live-on";
    const roomId = await openSeededRoom("room-deb-on", liveText);
    persistRuntime.mockClear();
    vi.useFakeTimers();
    scheduleLiveTranscriptFlush();
    expect(blobTexts(roomId)).not.toContain(liveText);
    await vi.advanceTimersByTimeAsync(LIVE_FLUSH_COALESCE_MS);
    expect(blobTexts(roomId)).toContain(liveText);
    expect(persistRuntime).toHaveBeenCalled();
  });

  it("scheduleLiveTranscriptFlush does not write L2 when retention is off", async () => {
    const liveText = "debounce-live-off";
    const roomId = await openSeededRoom("room-deb-off", liveText);
    persistRuntime.mockClear();
    useSettingsStore.getState().setPrivacy({ localMessageRetention: false });
    const chatRoomsBefore = JSON.stringify(readChatRooms(raw));
    vi.useFakeTimers();
    scheduleLiveTranscriptFlush();
    await vi.advanceTimersByTimeAsync(LIVE_FLUSH_COALESCE_MS);
    expect(JSON.stringify(readChatRooms(raw))).toBe(chatRoomsBefore);
    expect(blobTexts(roomId)).not.toContain(liveText);
    expect(persistRuntime).not.toHaveBeenCalled();
  });
});
