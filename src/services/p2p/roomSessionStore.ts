/**
 * Persist Holepunch session material so a reload can resume without rewinding nonces.
 * Browser debug uses localStorage. Electron uses safeStorage, or the wallet when
 * Linux has no secret service. Mobile keeps secure prefs.
 * @see docs/security/encryption.md
 * @see docs/architecture/electron-desktop.md
 */

import type { RawWalletV1 } from "conceal-wallet-sdk";
import { getRuntime, persistRuntime } from "@/services/conceal/sync/runtime";
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

type HostMode = "storage" | "os" | "wallet";

type RawWithRoomSessions = RawWalletV1 & {
  roomSessions?: unknown;
};

let hostMode: HostMode = "storage";
let cache: Record<string, PersistedRoomSession> | null = null;
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

function electronBridge(): {
  loadRoomSessions: NonNullable<GnhDesktopBridge["loadRoomSessions"]>;
  saveRoomSessions: NonNullable<GnhDesktopBridge["saveRoomSessions"]>;
  clearRoomSessions?: GnhDesktopBridge["clearRoomSessions"];
} | null {
  if (typeof window === "undefined") return null;
  const bridge = window.gnhDesktop;
  if (!bridge?.loadRoomSessions || !bridge.saveRoomSessions) return null;
  return {
    loadRoomSessions: bridge.loadRoomSessions.bind(bridge),
    saveRoomSessions: bridge.saveRoomSessions.bind(bridge),
    clearRoomSessions: bridge.clearRoomSessions?.bind(bridge),
  };
}

function isSession(value: unknown): value is PersistedRoomSession {
  if (typeof value !== "object" || value === null) return false;
  const row = value as PersistedRoomSession;
  return (
    typeof row.roomId === "string" &&
    typeof row.sendKeyHex === "string" &&
    typeof row.recvKeyHex === "string" &&
    typeof row.sendCounter === "number" &&
    typeof row.recvCounter === "number"
  );
}

function parseSessionMap(raw: unknown): Record<string, PersistedRoomSession> {
  if (typeof raw === "string") {
    try {
      return parseSessionMap(JSON.parse(raw) as unknown);
    } catch {
      return {};
    }
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, PersistedRoomSession> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!isSession(value)) continue;
    out[value.roomId || id] = value;
  }
  return out;
}

/** Higher counter wins. Used when moving a legacy row into the host store. */
export function mergeRoomSessionMaps(
  primary: Record<string, PersistedRoomSession>,
  extra: Record<string, PersistedRoomSession>,
): Record<string, PersistedRoomSession> {
  const out = { ...primary };
  for (const [id, row] of Object.entries(extra)) {
    const prev = out[id];
    if (!prev || row.sendCounter > prev.sendCounter) out[id] = row;
  }
  return out;
}

function readStorage(): Record<string, PersistedRoomSession> {
  try {
    const raw = getStorage().getItem(KEY);
    if (!raw) return {};
    return parseSessionMap(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

function writeStorage(all: Record<string, PersistedRoomSession>): void {
  getStorage().setItem(KEY, JSON.stringify(all));
}

function readWallet(): Record<string, PersistedRoomSession> {
  const rt = getRuntime();
  if (!rt) return {};
  return parseSessionMap((rt.raw as RawWithRoomSessions).roomSessions);
}

/** Drop device-local session keys before a wallet file leaves this machine. */
export function withoutRoomSessions(raw: RawWalletV1): RawWalletV1 {
  if (!("roomSessions" in raw)) return raw;
  const next = { ...raw } as RawWithRoomSessions;
  delete next.roomSessions;
  return next;
}

function readAll(): Record<string, PersistedRoomSession> {
  if (hostMode === "storage") return readStorage();
  return cache ?? {};
}

async function persistHost(
  all: Record<string, PersistedRoomSession>,
): Promise<void> {
  if (hostMode === "os") {
    const bridge = electronBridge();
    if (!bridge) throw new Error("Desktop session store unavailable.");
    const reply = await bridge.saveRoomSessions(JSON.stringify(all));
    if (reply.mode === "wallet") {
      hostMode = "wallet";
      await persistWallet(all);
    }
    return;
  }
  if (hostMode === "wallet") {
    await persistWallet(all);
    return;
  }
  writeStorage(all);
}

async function persistWallet(
  all: Record<string, PersistedRoomSession>,
): Promise<void> {
  const rt = getRuntime();
  if (!rt) throw new Error("Wallet is locked.");
  rt.raw = { ...rt.raw, roomSessions: all } as RawWalletV1;
  await persistRuntime(rt);
}

function clearWalletField(): void {
  if (hostMode === "storage") return;
  const rt = getRuntime();
  if (!rt || !("roomSessions" in rt.raw)) return;
  const next = { ...rt.raw } as RawWithRoomSessions;
  delete next.roomSessions;
  rt.raw = next;
  void persistRuntime(rt);
}

async function doHydrate(): Promise<void> {
  const bridge = electronBridge();
  if (!bridge) {
    hostMode = "storage";
    hydrated = true;
    return;
  }
  const reply = await bridge.loadRoomSessions();
  const legacy = readStorage();
  if (reply.mode === "wallet") {
    if (!getRuntime()) {
      hostMode = "wallet";
      return;
    }
    hostMode = "wallet";
    cache = readWallet();
  } else {
    hostMode = "os";
    cache = mergeRoomSessionMaps(parseSessionMap(reply.json), readWallet());
  }
  cache = mergeRoomSessionMaps(cache, legacy);
  const hadLegacy = Object.keys(legacy).length > 0;
  const hadWallet = Object.keys(readWallet()).length > 0;
  if (
    (hadLegacy || (hostMode === "os" && hadWallet)) &&
    Object.keys(cache).length > 0
  ) {
    await persistHost(cache);
  }
  if (hadLegacy) getStorage().removeItem(KEY);
  if (hostMode === "os" && hadWallet) clearWalletField();
  hydrated = true;
}

/** Load the host store once. Browser debug is a no-op. */
export function hydrateRoomSessions(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (!hydratePromise) {
    hydratePromise = doHydrate().finally(() => {
      hydratePromise = null;
    });
  }
  return hydratePromise;
}

/** Drop the in-memory copy on lock. The host store stays. */
export function lockRoomSessionMemory(): void {
  if (hostMode === "storage") return;
  cache = {};
  hydrated = false;
}

function applyMonotonic(
  all: Record<string, PersistedRoomSession>,
  session: PersistedRoomSession,
): Record<string, PersistedRoomSession> {
  const prev = all[session.roomId];
  const sendCounter = Math.max(session.sendCounter, prev?.sendCounter ?? 0);
  const recvCounter = Math.max(session.recvCounter, prev?.recvCounter ?? 0);
  const rewinding =
    prev !== undefined &&
    (session.sendCounter < prev.sendCounter ||
      session.recvCounter < prev.recvCounter);
  const base = rewinding ? prev : session;
  return {
    ...all,
    [session.roomId]: {
      ...base,
      sendCounter,
      recvCounter,
      contract: { ...base.contract, sendCounter, recvCounter },
      savedAt: new Date().toISOString(),
    },
  };
}

export function loadRoomSession(
  roomId: string,
): PersistedRoomSession | undefined {
  return readAll()[roomId];
}

/** Counters only move forward. A later save cannot rewind a seal. @see docs/security/encryption.md */
export async function saveRoomSession(
  session: PersistedRoomSession,
): Promise<void> {
  const next = applyMonotonic(readAll(), session);
  if (hostMode !== "storage") cache = next;
  await persistHost(next);
}

export async function updateRoomSessionCounters(
  roomId: string,
  counters: { sendCounter: number; recvCounter: number },
): Promise<void> {
  const all = readAll();
  const prev = all[roomId];
  if (!prev) return;
  await saveRoomSession({
    ...prev,
    sendCounter: counters.sendCounter,
    recvCounter: counters.recvCounter,
  });
}

export async function removeRoomSession(roomId: string): Promise<void> {
  const all = readAll();
  if (!(roomId in all)) return;
  const next = { ...all };
  delete next[roomId];
  if (hostMode !== "storage") cache = next;
  await persistHost(next);
}

/** Wipe every host copy. Called when the wallet identity changes. */
export function clearRoomSessionStore(): void {
  cache = {};
  hydrated = hostMode === "storage";
  getStorage().removeItem(KEY);
  electronBridge()?.clearRoomSessions?.();
  clearWalletField();
}
