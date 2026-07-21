import { describe, expect, it } from "vitest";
import {
  parseScannedPaymentId,
  parseScannedSendPayload,
  paymentIdIsValid,
} from "@/lib/parse-scanned-payload";

describe("parseScannedPaymentId", () => {
  it("accepts 16- and 64-char hex", () => {
    expect(paymentIdIsValid("a".repeat(16))).toBe(true);
    expect(paymentIdIsValid("b".repeat(64))).toBe(true);
    expect(paymentIdIsValid("zzzz")).toBe(false);
    expect(paymentIdIsValid("")).toBe(false);
  });

  it("reads a raw payment id", () => {
    const pid = "0123456789abcdef";
    expect(parseScannedPaymentId(pid)).toBe(pid);
  });
});

describe("parseScannedSendPayload", () => {
  it("returns null for empty", () => {
    expect(parseScannedSendPayload("")).toBeNull();
    expect(parseScannedSendPayload("   ")).toBeNull();
  });

  it("treats a bare ccx7-looking string as address draft", () => {
    const draft = parseScannedSendPayload(
      "ccx7notavalidchecksumbutstartswithprefix",
    );
    expect(draft?.address.startsWith("ccx7")).toBe(true);
  });
});
