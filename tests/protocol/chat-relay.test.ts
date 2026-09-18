import { MAX_MESSAGE_BODY_BYTES } from "conceal-wallet-sdk";
import { describe, expect, it } from "vitest";
import {
  encodeRelaySmartBody,
  parseChatSmartBody,
  sanitizeRelayDisplayText,
} from "../../src/services/protocol/SmartMessageProtocolAdapter";
import type { ChatRelayPayload } from "../../src/types/protocol";
import { RELAY_MAX_TEXT_CHARS } from "../../src/types/protocol";

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

  it("maps commas to semicolons on wire and restores on parse", () => {
    const payload: ChatRelayPayload = {
      type: "chat.relay",
      roomId: "aabbccdd",
      sentAt: 1_700_000_000,
      text: "Ha, daccord }",
    };
    expect(sanitizeRelayDisplayText(payload.text)).toBe("Ha, daccord");
    const body = encodeRelaySmartBody(payload);
    expect(body).toContain("Ha; daccord");
    expect(body).not.toContain("Ha, daccord");
    const parsed = parseChatSmartBody(body);
    expect(parsed?.action).toBe("relay");
    if (parsed?.action !== "relay") throw new Error("expected relay");
    expect(parsed.payload.text).toBe("Ha, daccord");
  });

  it("strips braces from display and rejects brace-only text", () => {
    expect(sanitizeRelayDisplayText("{hi}")).toBe("hi");
    expect(() =>
      encodeRelaySmartBody({
        type: "chat.relay",
        roomId: "aabbccdd",
        sentAt: 1,
        text: "{}}{",
      }),
    ).toThrow(/required/i);
  });

  it("parses legacy on-wire commas as full remainder text", () => {
    const legacy = "{contact,e,aabbccdd,1700000000,Ha, daccord }}";
    const parsed = parseChatSmartBody(legacy);
    expect(parsed?.action).toBe("relay");
    if (parsed?.action !== "relay") throw new Error("expected relay");
    expect(parsed.payload.text).toBe("Ha, daccord");
  });

  it("rejects incomplete bodies", () => {
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
