/**
 * Durable revoked rooms — blocks re-seed from on-chain create after leave/decline.
 * @see docs/security/p2pchatprotocol.md
 */
import { getStorage } from "@/services/storage/StorageAdapter";

const KEY = "gnh.revokedRooms";

export type RevokedRoomRecord = {
  roomId: string;
  inviteId?: string;
  revokedAt: string;
};

function readAll(): Record<string, RevokedRoomRecord> {
  try {
    const raw = getStorage().getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as Record<string, RevokedRoomRecord>;
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, RevokedRoomRecord>): void {
  getStorage().setItem(KEY, JSON.stringify(all));
}

export function rememberRevokedRoom(roomId: string, inviteId?: string): void {
  if (!roomId) return;
  const all = readAll();
  all[roomId] = {
    roomId,
    inviteId: inviteId || all[roomId]?.inviteId,
    revokedAt: new Date().toISOString(),
  };
  writeAll(all);
}

export function isRoomRevoked(roomId: string): boolean {
  if (!roomId) return false;
  return Boolean(readAll()[roomId]);
}

export function isInviteRevoked(inviteId: string): boolean {
  if (!inviteId) return false;
  const needle = inviteId.trim().toLowerCase();
  return Object.values(readAll()).some(
    (r) => r.inviteId && r.inviteId.trim().toLowerCase() === needle,
  );
}
