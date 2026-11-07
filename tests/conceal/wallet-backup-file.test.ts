// @vitest-environment node
import { createAccount, type RawWalletV1 } from "conceal-wallet-sdk";
import { describe, expect, it } from "vitest";
import {
  openEncryptedWalletFile,
  saveEncryptedWalletFile,
} from "@/services/conceal/ConcealWalletAdapter";

/** Real SDK (no mocks): backup text written by GNH reopens, including legacy pretty files. */
describe("wallet backup file round-trip", () => {
  const acct = createAccount("english");
  const raw: RawWalletV1 = {
    deposits: [],
    withdrawals: [],
    transactions: [],
    lastHeight: 42,
    nonce: "",
    keys: {
      pub: { spend: acct.keys.spend.pub, view: acct.keys.view.pub },
      priv: { spend: acct.keys.spend.sec, view: acct.keys.view.sec },
    },
    creationHeight: 0,
    options: {},
  };
  const text = saveEncryptedWalletFile(raw, "backup-pw");

  it("writes a readable header with ciphertext data on one line", () => {
    const lines = text.trimEnd().split("\n");
    expect(lines[1]).toBe('  "envelope": 3,');
    expect(lines.at(-2)).toMatch(/^ {2}"data": \[\d+(,\d+)*\]$/);
  });

  it("reopens with the backup password, not a wrong one", () => {
    expect(openEncryptedWalletFile(text, "backup-pw")?.raw.lastHeight).toBe(42);
    expect(openEncryptedWalletFile(text, "wrong-pw")).toBeNull();
  });

  it("reopens a legacy pretty-printed download with a BOM", () => {
    const pretty = `\uFEFF${JSON.stringify(JSON.parse(text), null, 2)}\n`;
    expect(openEncryptedWalletFile(pretty, "backup-pw")?.envelope).toBe(3);
  });
});
