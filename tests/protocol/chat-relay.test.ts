import { describe, expect, it } from "vitest";
import { MAX_MESSAGE_BODY_BYTES } from "conceal-wallet-sdk";
import {
  encodeRelaySmartBody,
  parseChatSmartBody,
} from "../../src/services/protocol/SmartMessageProtocolAdapter";
import { RELAY_MAX_TEXT_CHARS } from "../../src/types/protocol";
import type { ChatRelayPayload } from "../../src/types/protocol";

describe("chat.relay wire encode/parse", () => {
  it("round-trips {contact,e,roomId,ts,text}", () => {
    const payload: ChatRelayPayload = {
      type: "chat.relay",
      roomId: "aabbccdd",
      sentAt: 1_700_000_000,
      text: "hello via chain",
    };
    const body = encodeRelaySmartBody(payload);
    expect(body.includes(",e,")).toBe(true);
    expect(body).toContain("hello via chain");
    expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(
      MAX_MESSAGE_BODY_BYTES,
    );
    const parsed = parseChatSmartBody(body);
    expect(parsed?.action).toBe("relay");
    if (parsed?.action !== "relay") throw new Error("expected relay");
    expect(parsed.payload).toEqual(payload);
  });

  it("rejects commas in text and incomplete bodies", () => {
    expect(() =>
      encodeRelaySmartBody({
        type: "chat.relay",
        roomId: "aabbccdd",
        sentAt: 1,
        text: "hello, world",
      }),
    ).toThrow(/,/);
    expect(parseChatSmartBody("{contact,e,roomOnly}")).toBeNull();
  });

  it("allows text up to RELAY_MAX_TEXT_CHARS", () => {
    expect(RELAY_MAX_TEXT_CHARS).toBeGreaterThan(24);
    const text = "x".repeat(RELAY_MAX_TEXT_CHARS);
    const body = encodeRelaySmartBody({
      type: "chat.relay",
      roomId: "aabbccdd",
      sentAt: 1_700_000_000,
      text,
    });
    expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(
      MAX_MESSAGE_BODY_BYTES,
    );
  });
});
