import { describe, expect, it } from "vitest";
import { decodeWalletQr, encodeWalletKeys } from "@/services/conceal/walletQr";

/** Invented fixtures — not copied from the change brief. */
const ADDRESS = "ccx7exportQrRoundTripAddr";
const SPEND = "b1c2d3e4".repeat(8);
const VIEW = "f00ba11e".repeat(8);
const HEIGHT = 18432;

function expectedKeysUri(height: number | null | undefined): string {
  const base = `conceal.${ADDRESS}?spend_key=${SPEND}?view_key=${VIEW}`;
  return height == null ? base : `${base}?height=${height}`;
}

describe("encodeWalletKeys", () => {
  it("emits conceal.address with spend, view, and height", () => {
    const encoded = encodeWalletKeys(ADDRESS, SPEND, VIEW, HEIGHT);
    expect(encoded).toBe(expectedKeysUri(HEIGHT));
  });

  it("round-trips address, keys, and height through decodeWalletQr", () => {
    const decoded = decodeWalletQr(
      encodeWalletKeys(ADDRESS, SPEND, VIEW, HEIGHT),
    );
    expect(decoded.address).toBe(ADDRESS);
    expect(decoded.spendKey).toBe(SPEND);
    expect(decoded.viewKey).toBe(VIEW);
    expect(decoded.height).toBe(HEIGHT);
    expect(decoded.mnemonicSeed).toBeUndefined();
  });

  it("omits the height segment when height is omitted or null", () => {
    expect(encodeWalletKeys(ADDRESS, SPEND, VIEW)).toBe(
      expectedKeysUri(undefined),
    );
    expect(encodeWalletKeys(ADDRESS, SPEND, VIEW, null)).toBe(
      expectedKeysUri(null),
    );
    expect(encodeWalletKeys(ADDRESS, SPEND, VIEW)).not.toContain("height=");
    expect(encodeWalletKeys(ADDRESS, SPEND, VIEW, null)).not.toContain(
      "height=",
    );
  });

  it("does not include mnemonic_seed", () => {
    const encoded = encodeWalletKeys(ADDRESS, SPEND, VIEW, HEIGHT);
    expect(encoded).not.toContain("mnemonic_seed");
  });
});
