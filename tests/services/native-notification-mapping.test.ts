import { describe, expect, it } from "vitest";
import {
  normalizeNotificationPreview,
  SINGLE_LINE_PREVIEW_GRAPHEMES,
  truncateNotificationPreview,
} from "../../src/services/notifications/graphemeTruncate";
import {
  buildKnownRoomMessagePreview,
  nativeNotificationBody,
  nativeNotificationTitle,
  resolveContactDisplayName,
  toNativeNotificationEvent,
} from "../../src/services/notifications/toNativeNotificationEvent";
import type { Contact } from "../../src/types/models";

const contact = { id: "c1", alias: "Alice" } as Contact;

describe("notification event mapping", () => {
  it("L1 received invitation maps to Room invitation received", () => {
    const native = toNativeNotificationEvent({
      kind: "l1_invitation_received",
      eventId: "e1",
      occurredAtMs: 1,
      contactId: "c1",
    });
    expect(native).not.toBeNull();
    expect(nativeNotificationTitle(native!)).toBe("Room invitation received");
    expect(nativeNotificationBody(native!)).toBe("Room invitation received");
  });

  it("L1 accepted invitation maps to Room invitation accepted", () => {
    const native = toNativeNotificationEvent({
      kind: "l1_invitation_accepted",
      eventId: "e2",
      occurredAtMs: 1,
      contactId: "c1",
    });
    expect(nativeNotificationTitle(native!)).toBe("Room invitation accepted");
  });

  it("L1' known-room message maps to contact: truncated message", () => {
    const native = toNativeNotificationEvent({
      kind: "l1_known_room_message",
      eventId: "e3",
      occurredAtMs: 1,
      contactId: "c1",
      contactDisplayName: "Alice",
      messagePreview: "hello there",
      roomId: "r1",
    });
    expect(nativeNotificationTitle(native!)).toBe("Alice");
    expect(nativeNotificationBody(native!)).toBe("Alice: hello there");
  });

  it("unknown contact fallback exposes no identifiers", () => {
    expect(resolveContactDisplayName(undefined)).toBe("New message");
    const { contactDisplayName } = buildKnownRoomMessagePreview(
      undefined,
      "hi",
    );
    expect(contactDisplayName).toBe("New message");
    expect(contactDisplayName).not.toMatch(/ccx|room|0x|[0-9a-f]{16,}/i);
  });

  it("empty / control-character-only message falls back to New message", () => {
    const { messagePreview } = buildKnownRoomMessagePreview(
      contact,
      "\u0000\u0001\u0002  \n\t",
    );
    expect(messagePreview).toBe("New message");
    const native = toNativeNotificationEvent({
      kind: "l1_known_room_message",
      eventId: "e4",
      occurredAtMs: 1,
      contactId: "c1",
      contactDisplayName: "Alice",
      messagePreview: "\u0007\u0008",
      roomId: "r1",
    });
    expect(native).toMatchObject({ messagePreview: "New message" });
  });
});

describe("grapheme-safe truncation", () => {
  it("strips control characters and collapses whitespace", () => {
    expect(normalizeNotificationPreview("a\u0000b\n\nc\t d")).toBe("a b c d");
  });

  it("keeps short messages intact", () => {
    expect(truncateNotificationPreview("hello")).toBe("hello");
  });

  it("truncates long ASCII at the grapheme limit with ellipsis", () => {
    const long = "x".repeat(200);
    const out = truncateNotificationPreview(long);
    expect(out.endsWith("…")).toBe(true);
    expect([...out].length).toBe(SINGLE_LINE_PREVIEW_GRAPHEMES + 1);
  });

  it("does not split emoji ZWJ sequences", () => {
    const family = "👨‍👩‍👧‍👦";
    const long = family.repeat(100);
    const out = truncateNotificationPreview(long);
    expect(out.endsWith("…")).toBe(true);
    const body = out.slice(0, -1);
    // Every retained grapheme must be a complete family emoji.
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    for (const { segment } of seg.segment(body)) {
      expect(segment).toBe(family);
    }
  });

  it("does not split combining marks", () => {
    const combined = "e\u0301"; // é as base + combining acute
    const long = combined.repeat(100);
    const out = truncateNotificationPreview(long);
    const body = out.slice(0, -1);
    expect(body.length % 2).toBe(0);
    expect(body.endsWith("\u0301")).toBe(true);
  });
});
