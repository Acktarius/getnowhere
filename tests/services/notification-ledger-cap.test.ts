import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetNotificationEventLedger,
  getNotificationLedgerEntry,
  hasNotificationLedgerEntry,
  markAllNotificationEventsRead,
  recordNotificationLedgerEntry,
  unreadNotificationCount,
} from "@/services/notifications/notificationEventLedger";

/** SEC-2026-027: ledger must bound growth without silently losing unread state. */
describe("notification ledger retention cap", () => {
  beforeEach(() => {
    __resetNotificationEventLedger();
  });

  it("keeps entries under the cap without eviction", () => {
    for (let i = 0; i < 10; i++) {
      recordNotificationLedgerEntry({
        eventId: `e${i}`,
        kind: "l1_known_room_message",
        occurredAtMs: i,
        read: true,
      });
    }
    for (let i = 0; i < 10; i++) {
      expect(hasNotificationLedgerEntry(`e${i}`)).toBe(true);
    }
  });

  it("evicts the oldest READ entries once over the 500-entry cap", () => {
    // Fill to the cap with old, already-read entries.
    for (let i = 0; i < 500; i++) {
      recordNotificationLedgerEntry({
        eventId: `old-${i}`,
        kind: "l1_known_room_message",
        occurredAtMs: i,
        read: true,
      });
    }
    expect(hasNotificationLedgerEntry("old-0")).toBe(true);

    // One more insert pushes past the cap — the single oldest read entry goes.
    recordNotificationLedgerEntry({
      eventId: "new-1",
      kind: "l1_known_room_message",
      occurredAtMs: 1000,
      read: true,
    });

    expect(hasNotificationLedgerEntry("old-0")).toBe(false);
    expect(hasNotificationLedgerEntry("old-1")).toBe(true);
    expect(hasNotificationLedgerEntry("new-1")).toBe(true);
  });

  it("never evicts unread entries, even past the cap (badge correctness)", () => {
    // 500 unread entries, all old.
    for (let i = 0; i < 500; i++) {
      recordNotificationLedgerEntry({
        eventId: `unread-${i}`,
        kind: "l1_invitation_received",
        occurredAtMs: i,
        read: false,
      });
    }
    // A new unread arrives — no read entries exist to evict, so nothing is dropped.
    recordNotificationLedgerEntry({
      eventId: "unread-new",
      kind: "l1_invitation_received",
      occurredAtMs: 1000,
      read: false,
    });

    expect(unreadNotificationCount()).toBe(501);
    expect(hasNotificationLedgerEntry("unread-0")).toBe(true);
    expect(hasNotificationLedgerEntry("unread-new")).toBe(true);
  });

  it("prefers evicting read entries over unread ones when both are over cap", () => {
    for (let i = 0; i < 490; i++) {
      recordNotificationLedgerEntry({
        eventId: `unread-${i}`,
        kind: "l1_invitation_received",
        occurredAtMs: 100 + i,
        read: false,
      });
    }
    for (let i = 0; i < 10; i++) {
      recordNotificationLedgerEntry({
        eventId: `read-${i}`,
        kind: "l1_known_room_message",
        occurredAtMs: i, // older than the unread batch
        read: true,
      });
    }
    // Now at exactly 500. One more push evicts the single oldest read entry,
    // not any unread one.
    recordNotificationLedgerEntry({
      eventId: "trigger",
      kind: "l1_known_room_message",
      occurredAtMs: 9999,
      read: true,
    });

    expect(hasNotificationLedgerEntry("read-0")).toBe(false);
    expect(hasNotificationLedgerEntry("read-1")).toBe(true);
    for (let i = 0; i < 490; i++) {
      expect(hasNotificationLedgerEntry(`unread-${i}`)).toBe(true);
    }
    expect(unreadNotificationCount()).toBe(490);
  });

  it("does not resurrect a read/dedup entry's data after eviction — later replay is a fresh insert", () => {
    recordNotificationLedgerEntry({
      eventId: "old",
      kind: "l1_known_room_message",
      occurredAtMs: 0,
      read: true,
    });
    for (let i = 1; i <= 500; i++) {
      recordNotificationLedgerEntry({
        eventId: `filler-${i}`,
        kind: "l1_known_room_message",
        occurredAtMs: i,
        read: true,
      });
    }
    expect(getNotificationLedgerEntry("old")).toBeUndefined();

    // A late replay of the evicted event is treated as new (accepted tradeoff —
    // documented as a bounded-retention cap, not an infinite dedupe window).
    const inserted = recordNotificationLedgerEntry({
      eventId: "old",
      kind: "l1_known_room_message",
      occurredAtMs: 10_000,
      read: false,
    });
    expect(inserted).toBe(true);
  });

  it("markAllNotificationEventsRead makes entries eligible for eviction on next insert", () => {
    for (let i = 0; i < 500; i++) {
      recordNotificationLedgerEntry({
        eventId: `e-${i}`,
        kind: "l1_invitation_received",
        occurredAtMs: i,
        read: false,
      });
    }
    markAllNotificationEventsRead();
    expect(unreadNotificationCount()).toBe(0);

    recordNotificationLedgerEntry({
      eventId: "e-new",
      kind: "l1_invitation_received",
      occurredAtMs: 1000,
      read: false,
    });

    expect(hasNotificationLedgerEntry("e-0")).toBe(false);
    expect(hasNotificationLedgerEntry("e-new")).toBe(true);
  });
});
