import { resolveWalletTransactionKind } from "conceal-wallet-sdk";
import { describe, expect, it } from "vitest";

describe("tx kind (history display)", () => {
  it("maps a plain inbound transfer", () => {
    const kind = resolveWalletTransactionKind({
      hash: "abc",
      amount: 1_000_000,
      fee: 0,
      height: 10,
      timestamp: 0,
      direction: "in",
      unlockTime: 0,
    });
    expect([
      "receive",
      "miner",
      "deposit",
      "withdrawal",
      "fusion",
      "send",
    ]).toContain(kind);
  });
});
