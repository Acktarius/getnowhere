import { describe, expect, it } from "vitest";
import { decodeWalletQr } from "@/services/conceal/walletQr";

/** Sample spend key for tests — not a real wallet. */
const SPEND = "a".repeat(64);

describe("decodeWalletQr", () => {
  it("decodes a mnemonic-seed payload (with the conceal. prefix)", () => {
    const d = decodeWalletQr(
      "conceal.ccx7ADDR?mnemonic_seed=abandon ability able?height=120",
    );
    expect(d.address).toBe("ccx7ADDR");
    expect(d.mnemonicSeed).toBe("abandon ability able");
    expect(d.height).toBe(120);
  });

  it("decodes a spend+view key payload without a prefix (bare address)", () => {
    const d = decodeWalletQr("ccx7ADDR?spend_key=aa11?view_key=bb22");
    expect(d.address).toBe("ccx7ADDR");
    expect(d.spendKey).toBe("aa11");
    expect(d.viewKey).toBe("bb22");
  });

  it("decodes a view-only payload (view key + address, no spend)", () => {
    const d = decodeWalletQr("conceal.ccx7VIEWONLY?view_key=cc33");
    expect(d.address).toBe("ccx7VIEWONLY");
    expect(d.viewKey).toBe("cc33");
    expect(d.spendKey).toBeUndefined();
  });

  it("ignores empty/unknown options and a negative height", () => {
    const d = decodeWalletQr("conceal.ccx7A?spend_key=?bogus=1?height=-5");
    expect(d.address).toBe("ccx7A");
    expect(d.spendKey).toBeUndefined();
    expect(d.height).toBeUndefined();
  });

  it("parses spend_key from a realistic QR URI shape", () => {
    const d = decodeWalletQr(`conceal.ccx7ADDR?spend_key=${SPEND}?height=42`);
    expect(d.spendKey).toBe(SPEND);
    expect(d.height).toBe(42);
  });
});
