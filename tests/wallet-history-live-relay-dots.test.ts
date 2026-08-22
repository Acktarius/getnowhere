/**
 * Groups 1–4: relay hints, navigate resolver, pagination, mid-sync publish throttle.
 * @see openspec/changes/wallet-history-live-relay-dots/tasks.md
 */

import { messages } from "conceal-wallet-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  encodeRelaySmartBody,
  peekContactHint,
} from "@/services/protocol/SmartMessageProtocolAdapter";

// ── Group 1: peekContactHint relay support ──

describe("peekContactHint — relay (execute/e) action", () => {
  const ROOM_ID = "deadbeef";
  const relayBody = encodeRelaySmartBody({
    type: "chat.relay",
    roomId: ROOM_ID,
    sentAt: 1_700_000_000,
    text: "hello",
  });

  it("returns action relay + roomId for a relay smartmessage", () => {
    const hint = peekContactHint(relayBody);
    expect(hint).not.toBeNull();
    expect(hint?.module).toBe("contact");
    expect(hint?.action).toBe("relay");
    // roomId must be present on relay hints
    expect((hint as { action: "relay"; roomId: string } | null)?.roomId).toBe(
      ROOM_ID,
    );
  });

  it("returns action relay for explicit execute-action smartmessage", () => {
    // CHAT_WIRE_ACTIONS.relay encodes as "execute" (SDK maps execute→e on send)
    const body = messages.encodeSmartMessage(
      "contact",
      "execute",
      "roomExec",
      "1700000001",
      "msg",
    );
    const hint = peekContactHint(body);
    expect(hint?.action).toBe("relay");
    expect((hint as { action: "relay"; roomId: string } | null)?.roomId).toBe(
      "roomExec",
    );
  });

  it("returns action relay for e-shorthand smartmessage", () => {
    const body = messages.encodeSmartMessage(
      "contact",
      "e",
      "roomShort",
      "1700000002",
      "short",
    );
    const hint = peekContactHint(body);
    expect(hint?.action).toBe("relay");
    expect((hint as { action: "relay"; roomId: string } | null)?.roomId).toBe(
      "roomShort",
    );
  });
});

describe("peekContactHint — create/register/revoke unchanged", () => {
  it("create returns action create without roomId", () => {
    const body = messages.encodeSmartMessage(
      "contact",
      "create",
      "1",
      "fakePack",
    );
    const hint = peekContactHint(body);
    expect(hint?.action).toBe("create");
    expect((hint as Record<string, unknown> | null)?.roomId).toBeUndefined();
  });

  it("register returns action register without roomId", () => {
    const body = messages.encodeSmartMessage(
      "contact",
      "register",
      "invId",
      "ephKey",
      "replayId",
    );
    const hint = peekContactHint(body);
    expect(hint?.action).toBe("register");
    expect((hint as Record<string, unknown> | null)?.roomId).toBeUndefined();
  });

  it("revoke returns action revoke without roomId", () => {
    const body = messages.encodeSmartMessage(
      "contact",
      "revoke",
      "invId",
      "",
      "user_declined",
    );
    const hint = peekContactHint(body);
    expect(hint?.action).toBe("revoke");
    expect((hint as Record<string, unknown> | null)?.roomId).toBeUndefined();
  });
});

describe("peekContactHint — junk input", () => {
  it("returns null for plain text", () => {
    expect(peekContactHint("not-a-smartmessage")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(peekContactHint("")).toBeNull();
  });

  it("returns null for wrong module", () => {
    const body = messages.encodeSmartMessage("other", "e", "room", "0", "t");
    expect(peekContactHint(body)).toBeNull();
  });

  it("returns null for unknown action", () => {
    const body = messages.encodeSmartMessage("contact", "unknown", "x");
    expect(peekContactHint(body)).toBeNull();
  });
});

// ── Group 2: resolveRelayRoute helper ──

import { resolveRelayRoute } from "@/lib/wallet-relay-navigate";

describe("resolveRelayRoute — room present", () => {
  it("returns chats path when roomId is in the catalog", () => {
    const result = resolveRelayRoute("room1", ["room1", "room2"], [], []);
    expect(result).toEqual({ route: "chat", roomId: "room1" });
  });

  it("returns chats path even when contact also has that roomId", () => {
    const contacts = [{ id: "c1", roomId: "room1" }];
    const result = resolveRelayRoute("room1", ["room1"], contacts, []);
    expect(result).toEqual({ route: "chat", roomId: "room1" });
  });
});

describe("resolveRelayRoute — room absent, contact fallback", () => {
  it("returns contact path via contact.roomId match", () => {
    const contacts = [{ id: "c2", roomId: "room-gone" }];
    const result = resolveRelayRoute("room-gone", [], contacts, []);
    expect(result).toEqual({ route: "contact", contactId: "c2" });
  });

  it("returns contact path via invite.roomId match", () => {
    const invites = [{ contactId: "c3", roomId: "inv-room" }];
    const result = resolveRelayRoute("inv-room", [], [], invites);
    expect(result).toEqual({ route: "contact", contactId: "c3" });
  });

  it("prefers contact.roomId over invite.roomId when both match", () => {
    const contacts = [{ id: "c4", roomId: "shared-room" }];
    const invites = [{ contactId: "c5", roomId: "shared-room" }];
    const result = resolveRelayRoute("shared-room", [], contacts, invites);
    expect(result).toEqual({ route: "contact", contactId: "c4" });
  });
});

describe("resolveRelayRoute — no match", () => {
  it("returns null when roomId not in catalog and no contacts/invites match", () => {
    const result = resolveRelayRoute("unknown-room", ["other"], [], []);
    expect(result).toBeNull();
  });

  it("returns null for empty state", () => {
    const result = resolveRelayRoute("any", [], [], []);
    expect(result).toBeNull();
  });
});

// ── Group 3: pagination helpers ──

import {
  clampPage,
  PAGE_SIZE,
  sliceWalletHistoryPage,
  totalPages,
} from "@/lib/wallet-history-page";

describe("totalPages", () => {
  it("returns 1 for empty list", () => {
    expect(totalPages(0)).toBe(1);
  });

  it("returns 1 for exactly PAGE_SIZE transactions", () => {
    expect(totalPages(PAGE_SIZE)).toBe(1);
  });

  it("returns 2 for PAGE_SIZE + 1 transactions", () => {
    expect(totalPages(PAGE_SIZE + 1)).toBe(2);
  });

  it("returns ceiling division for arbitrary count", () => {
    expect(totalPages(51)).toBe(3);
    expect(totalPages(50)).toBe(2);
  });
});

describe("clampPage", () => {
  it("returns 1 for empty list regardless of page", () => {
    expect(clampPage(5, 0)).toBe(1);
  });

  it("returns 1 when page < 1", () => {
    expect(clampPage(0, 30)).toBe(1);
  });

  it("clamps page to max when page exceeds totalPages", () => {
    expect(clampPage(10, PAGE_SIZE + 1)).toBe(2);
  });

  it("does not clamp a valid page", () => {
    expect(clampPage(2, PAGE_SIZE * 3)).toBe(2);
  });
});

describe("sliceWalletHistoryPage", () => {
  const makeTxs = (n: number) => Array.from({ length: n }, (_, i) => i);

  it("returns empty array for empty list", () => {
    expect(sliceWalletHistoryPage([], 1)).toEqual([]);
  });

  it("returns all items when count <= PAGE_SIZE on page 1", () => {
    const txs = makeTxs(PAGE_SIZE);
    expect(sliceWalletHistoryPage(txs, 1)).toHaveLength(PAGE_SIZE);
  });

  it("returns first PAGE_SIZE items on page 1 when count > PAGE_SIZE", () => {
    const txs = makeTxs(PAGE_SIZE + 5);
    const slice = sliceWalletHistoryPage(txs, 1);
    expect(slice).toHaveLength(PAGE_SIZE);
    expect(slice[0]).toBe(0);
  });

  it("returns remaining items on last short page", () => {
    const txs = makeTxs(PAGE_SIZE + 3);
    const slice = sliceWalletHistoryPage(txs, 2);
    expect(slice).toHaveLength(3);
    expect(slice[0]).toBe(PAGE_SIZE);
  });

  it("preserves original order (newest-first)", () => {
    const txs = makeTxs(PAGE_SIZE * 2);
    const page2 = sliceWalletHistoryPage(txs, 2);
    expect(page2[0]).toBe(PAGE_SIZE);
  });
});

// ── Group 4: makeLeadingTrailingThrottle unit tests ──

import {
  makeLeadingTrailingThrottle,
  prepareRawForHistoryPublish,
  shouldPublishHistory,
} from "@/services/conceal/sync/history-publish";

describe("makeLeadingTrailingThrottle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires fn immediately on the first call (leading edge)", () => {
    const fn = vi.fn();
    const throttled = makeLeadingTrailingThrottle(fn, 1000);
    throttled("a");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("a");
  });

  it("gates further calls within the window — only the leading fires", () => {
    const fn = vi.fn();
    const throttled = makeLeadingTrailingThrottle(fn, 1000);
    throttled("a");
    throttled("b");
    throttled("c");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("a");
  });

  it("fires trailing with the last queued arg after the window", () => {
    const fn = vi.fn();
    const throttled = makeLeadingTrailingThrottle(fn, 1000);
    throttled("a");
    throttled("b");
    throttled("c");
    vi.advanceTimersByTime(1001);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("c");
  });

  it("does NOT fire trailing when no subsequent calls arrive", () => {
    const fn = vi.fn();
    const throttled = makeLeadingTrailingThrottle(fn, 1000);
    throttled("a");
    vi.advanceTimersByTime(1001);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("accepts a new leading call once the window expires", () => {
    const fn = vi.fn();
    const throttled = makeLeadingTrailingThrottle(fn, 1000);
    throttled("a");
    vi.advanceTimersByTime(1001);
    throttled("b");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("b");
  });
});

// ── Group 4 relay: shouldPublishHistory + prepareRawForHistoryPublish ──

import type { RawWalletV1 } from "conceal-wallet-sdk";
import { mapWalletTransactions } from "@/services/conceal/mapWalletTransactions";
import type { SdkMessageRecord } from "@/services/conceal/sync/messages-store";

describe("shouldPublishHistory — relay-only notify gate", () => {
  it("returns true when only foldedThisBatch", () => {
    expect(shouldPublishHistory(true, false)).toBe(true);
  });

  it("returns true when only receivedChangedThisBatch (relay-only path)", () => {
    expect(shouldPublishHistory(false, true)).toBe(true);
  });

  it("returns true when both changed", () => {
    expect(shouldPublishHistory(true, true)).toBe(true);
  });

  it("returns false when neither changed (idle re-scan)", () => {
    expect(shouldPublishHistory(false, false)).toBe(false);
  });
});

describe("prepareRawForHistoryPublish — relay record flushed to rt.raw", () => {
  const relayRecord: SdkMessageRecord = {
    id: "abcdef1234",
    direction: "received",
    counterpartyAddress: "ccx1addr",
    counterpartyName: "ccx1addr",
    body: "relay-body",
    hasBody: true,
    sentTo: null,
    paymentIdFrom: null,
    paymentIdTo: null,
    timestamp: "1700000000",
    unread: false,
    blockHeight: 100,
    threadKey: "threadkey",
  };

  it("returns same raw reference when receivedChangedThisBatch is false", () => {
    const raw = {} as unknown as RawWalletV1;
    const result = prepareRawForHistoryPublish(raw, new Map(), false);
    expect(result).toBe(raw);
  });

  it("returns new raw with relay record when receivedChangedThisBatch is true", () => {
    const raw = {} as unknown as RawWalletV1;
    const received = new Map([["abcdef1234", relayRecord]]);
    const result = prepareRawForHistoryPublish(raw, received, true);
    expect(result).not.toBe(raw);
    expect((result as Record<string, unknown>).receivedMessages).toEqual([
      relayRecord,
    ]);
  });
});

describe("mapWalletTransactions — relay record visible when raw has it", () => {
  it("includes a relay-received entry with contactHint when raw.receivedMessages has it", () => {
    // A relay record carrying an execute smartmessage body (action=relay, roomId present).
    const relayBody = messages.encodeSmartMessage(
      "contact",
      "execute",
      "room-relay-99",
      "1700000002",
      "msg",
    );
    const relayRecord: SdkMessageRecord = {
      id: "txhash-relay",
      direction: "received",
      counterpartyAddress: "ccx1sender",
      counterpartyName: "ccx1sender",
      body: relayBody,
      hasBody: true,
      sentTo: null,
      paymentIdFrom: null,
      paymentIdTo: null,
      timestamp: new Date(1700000002000).toISOString(),
      unread: false,
      blockHeight: 200,
      threadKey: "tk",
    };
    const raw = { receivedMessages: [relayRecord] } as unknown as RawWalletV1;
    const txs = mapWalletTransactions([], raw);
    const relayTx = txs.find((t) => t.hash === "txhash-relay");
    expect(relayTx).toBeDefined();
    expect(relayTx?.contactHint?.action).toBe("relay");
    expect(
      (relayTx?.contactHint as { action: string; roomId: string } | null)
        ?.roomId,
    ).toBe("room-relay-99");
  });
});
