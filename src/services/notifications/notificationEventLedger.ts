/** Persistent notification-event ledger (dedup + unread badge). @see docs/features/local-background-notifications.md */
import { getStorage } from "@/services/storage/StorageAdapter";

const STORAGE_KEY = "gnh.notificationEvents.v1";

export type NotificationLedgerEntry = {
  eventId: string;
  kind:
    | "l1_invitation_received"
    | "l1_invitation_accepted"
    | "l1_known_room_message";
  occurredAtMs: number;
  read: boolean;
  /** Opaque routing hints — never wallet/room ids in OS payloads. */
  contactId?: string;
  roomId?: string;
};

type LedgerState = {
  entries: Record<string, NotificationLedgerEntry>;
};

function loadState(): LedgerState {
  try {
    const raw = getStorage().getItem(STORAGE_KEY);
    if (!raw) return { entries: {} };
    const parsed = JSON.parse(raw) as LedgerState;
    if (!parsed.entries || typeof parsed.entries !== "object") {
      return { entries: {} };
    }
    return parsed;
  } catch {
    return { entries: {} };
  }
}

function persistState(state: LedgerState): void {
  getStorage().setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getNotificationLedgerEntry(
  eventId: string,
): NotificationLedgerEntry | undefined {
  return loadState().entries[eventId];
}

export function hasNotificationLedgerEntry(eventId: string): boolean {
  return Boolean(loadState().entries[eventId]);
}

/** Insert once; returns false when eventId already exists (replay). */
export function recordNotificationLedgerEntry(
  entry: Omit<NotificationLedgerEntry, "read"> & { read?: boolean },
): boolean {
  const state = loadState();
  if (state.entries[entry.eventId]) return false;
  state.entries[entry.eventId] = {
    ...entry,
    read: entry.read ?? false,
  };
  persistState(state);
  return true;
}

export function unreadNotificationCount(): number {
  const state = loadState();
  return Object.values(state.entries).filter((e) => !e.read).length;
}

export function markNotificationEventsRead(filter: {
  contactId?: string;
  roomId?: string;
  kinds?: NotificationLedgerEntry["kind"][];
}): number {
  const state = loadState();
  let changed = 0;
  for (const entry of Object.values(state.entries)) {
    if (entry.read) continue;
    if (filter.contactId && entry.contactId !== filter.contactId) continue;
    if (filter.roomId && entry.roomId !== filter.roomId) continue;
    if (filter.kinds && !filter.kinds.includes(entry.kind)) continue;
    entry.read = true;
    changed += 1;
  }
  if (changed > 0) persistState(state);
  return changed;
}

export function markAllNotificationEventsRead(): void {
  const state = loadState();
  let changed = false;
  for (const entry of Object.values(state.entries)) {
    if (entry.read) continue;
    entry.read = true;
    changed = true;
  }
  if (changed) persistState(state);
}

/** Test helper */
export function __resetNotificationEventLedger(): void {
  persistState({ entries: {} });
}
