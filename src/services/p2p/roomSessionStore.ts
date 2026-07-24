/**
 * Persist Holepunch session material so Alice/Bob can reconnect after refresh.
 * Crypto session must survive reload; Hyperswarm presence lives in the sidecar.
 */
import { getStorage } from "@/services/storage/StorageAdapter";
import type { HolepunchBootstrapContract } from "@/types/protocol";

const KEY = "gnh.roomSessions";

export type PersistedRoomSession = {
  roomId: string;
  contactId: string;
  contract: HolepunchBootstrapContract;
  sendKeyHex: string;
  recvKeyHex: string;
  sendCounter: number;
  recvCounter: number;
  savedAt: string;
};

function readAll(): Record<string, PersistedRoomSession> {
  try {
    const raw = getStorage().getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as Record<string, PersistedRoomSession>;
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, PersistedRoomSession>): void {
  getStorage().setItem(KEY, JSON.stringify(all));
}

export function loadRoomSession(
  roomId: string,
): PersistedRoomSession | undefined {
  return readAll()[roomId];
}

export function saveRoomSession(session: PersistedRoomSession): void {
  const all = readAll();
  all[session.roomId] = session;
  writeAll(all);
}

export function updateRoomSessionCounters(
  roomId: string,
  counters: { sendCounter: number; recvCounter: number },
): void {
  const all = readAll();
  const prev = all[roomId];
  if (!prev) return;
  all[roomId] = {
    ...prev,
    sendCounter: counters.sendCounter,
    recvCounter: counters.recvCounter,
    contract: {
      ...prev.contract,
      sendCounter: counters.sendCounter,
      recvCounter: counters.recvCounter,
    },
    savedAt: new Date().toISOString(),
  };
  writeAll(all);
}

export function removeRoomSession(roomId: string): void {
  const all = readAll();
  if (!(roomId in all)) return;
  delete all[roomId];
  writeAll(all);
}
