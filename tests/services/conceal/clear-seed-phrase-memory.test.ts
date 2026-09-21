import { describe, expect, it } from "vitest";
import {
  clearSeedPhraseMemory,
  getInternalWalletState,
} from "@/services/conceal/ConcealWalletService";

describe("clearSeedPhraseMemory", () => {
  it("is safe with no wallet snapshot and leaves no mnemonic", () => {
    clearSeedPhraseMemory();
    const snap = getInternalWalletState();
    expect(snap?.seedPhrase ?? "").toBe("");
  });
});
