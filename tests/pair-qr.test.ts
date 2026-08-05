import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/conceal/ConcealWalletAdapter", () => ({
  validateCcxAddress: (address: string) => address.trim().startsWith("ccx7"),
}));

import {
  encodePairQrPayload,
  parsePairQrPayload,
} from "@/lib/pair-qr";

const ADDR = "ccx7testpairaddress";
const PID = "0123456789abcdef";

describe("pair-qr", () => {
  it("round-trips encode and parse", () => {
    const raw = encodePairQrPayload({
      address: ADDR,
      paymentIdFrom: PID,
    });
    const parsed = parsePairQrPayload(raw);
    expect(parsed).toEqual({
      v: 1,
      t: "gnh-pair",
      a: ADDR,
      p: PID,
    });
  });

  it("rejects non-pair JSON", () => {
    expect(parsePairQrPayload('{"v":1,"t":"other"}')).toBeNull();
    expect(parsePairQrPayload("not-json")).toBeNull();
  });

  it("rejects invalid address or payment id", () => {
    expect(
      parsePairQrPayload(
        JSON.stringify({ v: 1, t: "gnh-pair", a: "bad", p: PID }),
      ),
    ).toBeNull();
    expect(
      parsePairQrPayload(
        JSON.stringify({ v: 1, t: "gnh-pair", a: ADDR, p: "short" }),
      ),
    ).toBeNull();
  });
});
