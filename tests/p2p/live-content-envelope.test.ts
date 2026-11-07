import { describe, expect, it } from "vitest";
import { parseLiveContentEnvelope } from "@/services/p2p/liveContentEnvelope";

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    messageId: "m1",
    clientId: "c1",
    sentAt: "2026-01-01T00:00:00.000Z",
    kind: "text",
    text: "hello",
    ...overrides,
  };
}

describe("parseLiveContentEnvelope", () => {
  it("accepts a text envelope and drops unknown fields", () => {
    const parsed = parseLiveContentEnvelope(
      envelope({ extra: { nested: true } }),
    );
    expect(parsed).toEqual(envelope());
  });

  it("rejects an unknown kind", () => {
    expect(parseLiveContentEnvelope(envelope({ kind: "system" }))).toBeNull();
  });

  it("rejects a non-string text field", () => {
    expect(
      parseLiveContentEnvelope(envelope({ text: { body: "x" } })),
    ).toBeNull();
  });

  it("rejects an oversized body", () => {
    expect(
      parseLiveContentEnvelope(envelope({ text: "a".repeat(8_001) })),
    ).toBeNull();
  });
});
