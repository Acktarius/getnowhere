/**
 * Durable room list — survives restart. Rooms leave the catalog only for:
 * leave forever (local or L1 room_revoked), unaccepted inviteExpiry, or roomTtl.
 * @see docs/security/p2pchatprotocol.md
 */

import { isRoomRevoked } from "@/services/p2p/revokedRoomsStore";
import {
  isInviteExpired,
  isPostAcceptStatus,
  isRoomExpired,
  nowUnix,
  resolveIncomingLifecycle,
} from "@/services/protocol/roomLifecycle";
import { getStorage } from "@/services/storage/StorageAdapter";
import type { ChatRoom, RoomLifecycleStatus } from "@/types/models";

const KEY = "gnh.roomCatalog";

export type CatalogRoom = Pick<
  ChatRoom,
  | "id"
  | "contactId"
  | "bootstrapSource"
  | "roomKeyRef"
  | "lifecycleStatus"
  | "roomTopic"
  | "inviteId"
  | "inviteExpiry"
  | "roomTtl"
  | "createdAt"
  | "lastMessageAt"
  | "lastConnectError"
  | "awaitingChainSync"
>;

function readAll(): Record<string, CatalogRoom> {
  try {
    const raw = getStorage().getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as Record<string, CatalogRoom>;
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, CatalogRoom>): void {
  getStorage().setItem(KEY, JSON.stringify(all));
}

function wasAccepted(status: RoomLifecycleStatus): boolean {
  return isPostAcceptStatus(status);
}

/**
 * True when this room must leave the catalog (product rule).
 * - roomTtl elapsed → always
 * - inviteExpiry elapsed and never accepted → expire unaccepted invite
 * Explicit leave is `removeCatalogRoom`, not inferred here.
 */
export function shouldRetireCatalogRoom(
  room: CatalogRoom,
  nowSec: number = nowUnix(),
): "room_ttl" | "invite_expiry" | null {
  if (room.lifecycleStatus === "expired") return "room_ttl";
  if (room.roomTtl && isRoomExpired(room.roomTtl, nowSec)) return "room_ttl";
  if (
    room.inviteExpiry &&
    isInviteExpired(room.inviteExpiry, nowSec) &&
    !wasAccepted(room.lifecycleStatus)
  ) {
    return "invite_expiry";
  }
  return null;
}

export function upsertCatalogRoom(room: CatalogRoom | ChatRoom): CatalogRoom {
  // Leave forever must stay gone — never re-write a revoked room.
  if (isRoomRevoked(room.id)) {
    removeCatalogRoom(room.id);
    return {
      id: room.id,
      contactId: room.contactId || "",
      bootstrapSource: room.bootstrapSource ?? "conceal-smart-message",
      roomKeyRef: room.roomKeyRef || `key:${room.id}`,
      lifecycleStatus: "closed",
      createdAt: room.createdAt || new Date().toISOString(),
    };
  }
  const all = readAll();
  const prev = all[room.id];
  const incomingLifecycle =
    room.lifecycleStatus ?? prev?.lifecycleStatus ?? "pending";
  const next: CatalogRoom = {
    id: room.id,
    contactId: room.contactId || prev?.contactId || "",
    bootstrapSource:
      room.bootstrapSource ?? prev?.bootstrapSource ?? "conceal-smart-message",
    roomKeyRef: room.roomKeyRef || prev?.roomKeyRef || `key:${room.id}`,
    // Monotonic: a stale `pending` hydration must never regress a room past acceptance.
    lifecycleStatus: resolveIncomingLifecycle(
      prev?.lifecycleStatus ?? "pending",
      incomingLifecycle,
    ),
    roomTopic: room.roomTopic ?? prev?.roomTopic,
    inviteId: room.inviteId ?? prev?.inviteId,
    inviteExpiry: room.inviteExpiry ?? prev?.inviteExpiry,
    roomTtl: room.roomTtl ?? prev?.roomTtl,
    createdAt: room.createdAt || prev?.createdAt || new Date().toISOString(),
    lastMessageAt: room.lastMessageAt ?? prev?.lastMessageAt,
    lastConnectError: room.lastConnectError ?? prev?.lastConnectError,
    awaitingChainSync: room.awaitingChainSync ?? prev?.awaitingChainSync,
  };
  all[room.id] = next;
  writeAll(all);
  return next;
}

export function patchCatalogRoom(
  roomId: string,
  patch: Partial<CatalogRoom>,
): CatalogRoom | null {
  if (isRoomRevoked(roomId)) {
    removeCatalogRoom(roomId);
    return null;
  }
  const all = readAll();
  const prev = all[roomId];
  if (!prev) return null;
  const next = { ...prev, ...patch, id: roomId };
  all[roomId] = next;
  writeAll(all);
  return next;
}

export type CatalogRetirementReason = "room_ttl" | "invite_expiry";

/** Catalog rows due for local destroy (run before silent prune). */
export function findCatalogRetirements(
  nowSec: number = nowUnix(),
): Array<{ room: CatalogRoom; reason: CatalogRetirementReason }> {
  const due: Array<{ room: CatalogRoom; reason: CatalogRetirementReason }> = [];
  for (const room of Object.values(readAll())) {
    if (isRoomRevoked(room.id)) continue;
    const reason = shouldRetireCatalogRoom(room, nowSec);
    if (reason) due.push({ room, reason });
  }
  return due;
}

/**
 * Peek at a catalog row without pruning it. Returns the row regardless of
 * expiry — use `shouldRetireCatalogRoom` after to decide.
 */
export function peekCatalogRoom(roomId: string): CatalogRoom | undefined {
  if (isRoomRevoked(roomId)) return undefined;
  return readAll()[roomId];
}

/** User chose to leave forever — only permanent remove API besides TTL prune. */
export function removeCatalogRoom(roomId: string): void {
  const all = readAll();
  if (!(roomId in all)) return;
  delete all[roomId];
  writeAll(all);
}

/** Drop rooms that hit inviteExpiry (unaccepted) or roomTtl. */
export function pruneCatalogRooms(nowSec: number = nowUnix()): CatalogRoom[] {
  const all = readAll();
  let changed = false;
  for (const [id, room] of Object.entries(all)) {
    if (isRoomRevoked(id) || shouldRetireCatalogRoom(room, nowSec)) {
      delete all[id];
      changed = true;
    }
  }
  if (changed) writeAll(all);
  return Object.values(all);
}

export function listCatalogRooms(): CatalogRoom[] {
  return pruneCatalogRooms();
}

export function loadCatalogRoom(roomId: string): CatalogRoom | undefined {
  if (isRoomRevoked(roomId)) {
    removeCatalogRoom(roomId);
    return undefined;
  }
  const room = readAll()[roomId];
  if (!room) return undefined;
  if (shouldRetireCatalogRoom(room)) {
    removeCatalogRoom(roomId);
    return undefined;
  }
  return room;
}
