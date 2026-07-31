import { describe, expect, it } from "vitest";
import type { RawWalletV1 } from "conceal-wallet-sdk";
import {
  isChatRoomRevokedInBlob,
  readChatRooms,
  saveActiveMessages,
  tombstoneChatRoom,
} from "@/services/p2p/chatRoomsBlob";
import type { ChatMessage } from "@/types/models";

function emptyRaw(): RawWalletV1 {
  return {
    deposits: [],
    withdrawals: [],
    transactions: [],
    lastHeight: 0,
    nonce: "",
  };
}

function msg(roomId: string, id: string, text: string): ChatMessage {
  return {
    id,
    roomId,
    direction: "out",
    text,
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "delivered",
  };
}

describe("chatRoomsBlob", () => {
  it("saves active messages into raw.chatRooms", () => {
    const roomId = "room-a";
    const raw = saveActiveMessages(emptyRaw(), {
      [roomId]: [msg(roomId, "m1", "hello")],
    });
    const entry = readChatRooms(raw)[roomId];
    expect(entry?.revoked).not.toBe(true);
    expect(entry && "messages" in entry ? entry.messages : []).toEqual([
      msg(roomId, "m1", "hello"),
    ]);
  });

  it("tombstone keeps only { roomId, revoked: true }", () => {
    const roomId = "room-b";
    let raw = saveActiveMessages(emptyRaw(), {
      [roomId]: [msg(roomId, "m1", "secret")],
    });
    raw = tombstoneChatRoom(raw, roomId);
    expect(readChatRooms(raw)[roomId]).toEqual({ roomId, revoked: true });
    expect(isChatRoomRevokedInBlob(raw, roomId)).toBe(true);
  });

  it("save does not revive a revoked tombstone", () => {
    const roomId = "room-c";
    let raw = tombstoneChatRoom(emptyRaw(), roomId);
    raw = saveActiveMessages(raw, {
      [roomId]: [msg(roomId, "m1", "nope")],
    });
    expect(readChatRooms(raw)[roomId]).toEqual({ roomId, revoked: true });
  });
});
