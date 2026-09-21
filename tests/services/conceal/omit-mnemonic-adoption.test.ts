import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("omitMnemonic adoption", () => {
  it("buildFromMnemonic uses omitMnemonic after capturing the phrase", () => {
    const src = readFileSync(
      join(root, "src/services/conceal/walletBuild.ts"),
      "utf8",
    );
    expect(src).toMatch(/omitMnemonic/);
    expect(src).toMatch(/const mnemonic = account\.mnemonic/);
  });

  it("createWallet goes through buildFromMnemonic (omitMnemonic path)", () => {
    const src = readFileSync(
      join(root, "src/services/conceal/ConcealWalletService.ts"),
      "utf8",
    );
    expect(src).toMatch(/generateConcealMnemonic/);
    expect(src).toMatch(/buildFromMnemonic\(phrase/);
  });

  it("DEV demo contacts omit mnemonic from generated accounts", () => {
    const src = readFileSync(
      join(root, "src/hooks/useSeedDemoContacts.ts"),
      "utf8",
    );
    expect(src).toMatch(/omitMnemonic/);
  });
});
