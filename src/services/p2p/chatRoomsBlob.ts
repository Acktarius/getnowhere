/**
 * Room transcripts inside the encrypted wallet blob (wallet password).
 * @see specs/changes/nav-exit-leave-room/design.md
 */
import type { RawWalletV1 } from "conceal-wallet-sdk";
import type { ChatMessage } from "@/types/models";

export type ChatRoomBlobActive = {
  roomId: string;
  revoked?: false;
  messages: ChatMessage[];
};

export type ChatRoomBlobRevoked = {
  roomId: string;
  revoked: true;
};

export type ChatRoomBlobEntry = ChatRoomBlobActive | ChatRoomBlobRevoked;

const FIELD = "chatRooms";

function isMessage(v: unknown): v is ChatMessage {
  if (typeof v !== "object" || v === null) return false;
  const m = v as ChatMessage;
  return (
    typeof m.id === "string" &&
    typeof m.roomId === "string" &&
    typeof m.text === "string" &&
    typeof m.createdAt === "string"
  );
}

function parseEntry(roomId: string, raw: unknown): ChatRoomBlobEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const e = raw as Record<string, unknown>;
  if (e.revoked === true) {
    return { roomId, revoked: true };
  }
  const messages = Array.isArray(e.messages)
    ? e.messages.filter(isMessage)
    : [];
  return { roomId, messages, revoked: false };
}

/** Read chatRooms map from wallet raw (unknown extension field). */
export function readChatRooms(
  raw: RawWalletV1,
): Record<string, ChatRoomBlobEntry> {
  const bag = raw[FIELD];
  if (typeof bag !== "object" || bag === null || Array.isArray(bag)) {
    return {};
  }
  const out: Record<string, ChatRoomBlobEntry> = {};
  for (const [roomId, value] of Object.entries(
    bag as Record<string, unknown>,
  )) {
    if (!roomId) continue;
    const entry = parseEntry(roomId, value);
    if (entry) out[roomId] = entry;
  }
  return out;
}

export function withChatRooms(
  raw: RawWalletV1,
  rooms: Record<string, ChatRoomBlobEntry>,
): RawWalletV1 {
  return { ...raw, [FIELD]: rooms };
}

/**
 * Save active room messages. Never replaces a revoked tombstone. Omits TTL rows.
 */
export function saveActiveMessages(
  raw: RawWalletV1,
  messagesByRoom: Record<string, ChatMessage[]>,
): RawWalletV1 {
  const next = { ...readChatRooms(raw) };
  for (const [roomId, messages] of Object.entries(messagesByRoom)) {
    if (!roomId) continue;
    if (next[roomId]?.revoked === true) continue;
    next[roomId] = {
      roomId,
      revoked: false,
      messages: messages.filter(
        (m) => !(typeof m.ttlExpiresAt === "number" && m.ttlExpiresAt > 0),
      ),
    };
  }
  return withChatRooms(raw, next);
}

/** Strip content; keep only `{ roomId, revoked: true }`. */
export function tombstoneChatRoom(
  raw: RawWalletV1,
  roomId: string,
): RawWalletV1 {
  if (!roomId) return raw;
  const next = { ...readChatRooms(raw) };
  next[roomId] = { roomId, revoked: true };
  return withChatRooms(raw, next);
}

export function isChatRoomRevokedInBlob(
  raw: RawWalletV1,
  roomId: string,
): boolean {
  return readChatRooms(raw)[roomId]?.revoked === true;
}
