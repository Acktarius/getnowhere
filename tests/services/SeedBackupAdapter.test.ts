import { beforeEach, describe, expect, it, vi } from "vitest";

type RuntimeMock = {
  password: string;
  viewOnly: boolean;
  account: {
    address: string;
    keys: { spend: { sec: string }; view: { sec: string } };
  };
  raw: { version: number; creationHeight?: unknown };
};

const getInternalWalletState = vi.fn(
  () => null as { seedPhrase: string } | null,
);
const getRuntime = vi.fn(
  () =>
    ({
      password: "wallet-secret",
      viewOnly: false,
      account: {
        address: "ccx1test",
        keys: {
          spend: { sec: "deadbeef" },
          view: { sec: "cafebabe" },
        },
      },
      raw: { version: 1 },
    }) as RuntimeMock | null,
);
const mnemonicFromSpendKey = vi.fn(
  () => "alpha bravo charlie delta echo foxtrot",
);
const persist = vi.fn(async () => undefined);
const saveEncryptedWalletFile = vi.fn(() => ({ cipher: "x" }));

vi.mock("@/services/conceal/ConcealWalletService", () => ({
  getInternalWalletState: () => getInternalWalletState(),
}));

vi.mock("@/services/conceal/sync", () => ({
  getRuntime: () => getRuntime(),
  persist: () => persist(),
}));

vi.mock("@/services/conceal/walletBuild", () => ({
  mnemonicFromSpendKey: (s: string) => mnemonicFromSpendKey(s),
}));

vi.mock("@/services/conceal/ConcealWalletAdapter", () => ({
  saveEncryptedWalletFile: (...a: unknown[]) =>
    saveEncryptedWalletFile(...(a as [])),
}));

import { SeedBackupAdapter } from "@/services/conceal/SeedBackupAdapter";

describe("SeedBackupAdapter", () => {
  beforeEach(() => {
    getInternalWalletState.mockReset();
    getInternalWalletState.mockReturnValue(null);
    getRuntime.mockReset();
    getRuntime.mockReturnValue({
      password: "wallet-secret",
      viewOnly: false,
      account: {
        address: "ccx1test",
        keys: {
          spend: { sec: "deadbeef" },
          view: { sec: "cafebabe" },
        },
      },
      raw: { version: 1 },
    });
    mnemonicFromSpendKey.mockReset();
    mnemonicFromSpendKey.mockReturnValue(
      "alpha bravo charlie delta echo foxtrot",
    );
    persist.mockClear();
    saveEncryptedWalletFile.mockClear();
    saveEncryptedWalletFile.mockReturnValue({ cipher: "x" });
  });

  it("revealSecrets rejects bad wallet password", async () => {
    await expect(SeedBackupAdapter.revealSecrets("bad")).rejects.toThrow(
      /Incorrect password/,
    );
  });

  it("revealSecrets returns mnemonic and keys", async () => {
    await expect(
      SeedBackupAdapter.revealSecrets("wallet-secret"),
    ).resolves.toEqual({
      address: "ccx1test",
      mnemonic: "alpha bravo charlie delta echo foxtrot",
      spendKey: "deadbeef",
      viewKey: "cafebabe",
      viewOnly: false,
      creationHeight: 0,
    });
  });

  it("revealSecrets returns creationHeight from raw", async () => {
    const fixtureHeight = 2_847_331;
    getRuntime.mockReturnValue({
      password: "wallet-secret",
      viewOnly: false,
      account: {
        address: "ccx1test",
        keys: {
          spend: { sec: "deadbeef" },
          view: { sec: "cafebabe" },
        },
      },
      raw: { version: 1, creationHeight: fixtureHeight },
    });

    const secrets = await SeedBackupAdapter.revealSecrets("wallet-secret");
    expect(secrets.creationHeight).toBe(fixtureHeight);
  });

  it("revealSecrets maps missing or invalid creationHeight to 0", async () => {
    for (const creationHeight of ["not-a-height", -12, Number.NaN] as const) {
      getRuntime.mockReturnValue({
        password: "wallet-secret",
        viewOnly: false,
        account: {
          address: "ccx1test",
          keys: {
            spend: { sec: "deadbeef" },
            view: { sec: "cafebabe" },
          },
        },
        raw: { version: 1, creationHeight },
      });

      const secrets = await SeedBackupAdapter.revealSecrets("wallet-secret");
      expect(secrets.creationHeight).toBe(0);
    }
  });

  it("downloadWalletBackup rejects bad password", async () => {
    await expect(SeedBackupAdapter.downloadWalletBackup("bad")).rejects.toThrow(
      /Incorrect password/,
    );
  });

  it("downloadWalletBackup persists and returns encrypted payload", async () => {
    const res = await SeedBackupAdapter.downloadWalletBackup("wallet-secret");
    expect(persist).toHaveBeenCalled();
    expect(saveEncryptedWalletFile).toHaveBeenCalledWith(
      { version: 1 },
      "wallet-secret",
    );
    expect(res.filename).toMatch(/getnowhere-wallet-.*\.json/);
    expect(res.payload).toEqual({ cipher: "x" });
  });
});
