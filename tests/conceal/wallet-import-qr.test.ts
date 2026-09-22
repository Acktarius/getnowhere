// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const adoptMock = vi.fn();
const buildFromSpendKeyMock = vi.fn();
const ensureWasmReadyMock = vi.fn();
const openEncryptedWalletFileMock = vi.fn();
const encodeCcxAddressMock = vi.fn();
const mnemonicFromSpendKeyMock = vi.fn();
const generateConcealMnemonicMock = vi.fn();
const buildFromMnemonicMock = vi.fn();

vi.mock("@/services/conceal/ConcealWalletAdapter", () => ({
  ensureWasmReady: ensureWasmReadyMock,
  openEncryptedWalletFile: openEncryptedWalletFileMock,
  encodeCcxAddress: encodeCcxAddressMock,
  previewKeysFromSpend: vi.fn(),
  validateCcxAddress: vi.fn(),
  buildDaemon: vi.fn(),
  createConcealAccount: vi.fn(),
  DEFAULT_DAEMON_NODES: [],
  generateConcealMnemonic: generateConcealMnemonicMock,
  makeIntegratedCcxAddress: vi.fn(),
}));

vi.mock("@/services/conceal/sync", () => ({
  adopt: adoptMock,
  changeRuntimePassword: vi.fn(),
  getRuntime: vi.fn(),
  hasStoredWallet: vi.fn(),
  lock: vi.fn(),
  nodeUrlFromRaw: vi.fn(),
  resetAndRescanFromCreationHeight: vi.fn(),
  resyncFromCreationHeight: vi.fn(),
  sendCcx: vi.fn(),
  sync: vi.fn(),
  unlock: vi.fn(),
  updateRuntimeOptions: vi.fn(),
}));

vi.mock("@/services/conceal/walletBuild", () => ({
  buildFromMnemonic: buildFromMnemonicMock,
  buildFromSpendKey: buildFromSpendKeyMock,
  buildViewOnly: vi.fn(),
  mnemonicFromSpendKey: mnemonicFromSpendKeyMock,
}));

describe("ConcealWalletService.importWallet qr", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("decodes wallet URI payloads instead of expecting JSON", async () => {
    buildFromSpendKeyMock.mockReturnValue({
      keys: { pub: { spend: "a", view: "b" }, priv: { spend: "c", view: "d" } },
      raw: { creationHeight: 0 },
      address: "ccx7test",
    });
    adoptMock.mockResolvedValue(undefined);

    const { ConcealWalletService } = await import(
      "@/services/conceal/ConcealWalletService"
    );

    const spendKey = "a".repeat(64);
    await ConcealWalletService.importWallet({
      method: "qr",
      qr: `conceal.ccx7ADDR?spend_key=${spendKey}?height=42`,
      password: "StrongPassword1!",
    });

    expect(buildFromSpendKeyMock).toHaveBeenCalledWith(spendKey, "", 42);
    expect(adoptMock).toHaveBeenCalledWith(
      expect.objectContaining({ password: "StrongPassword1!" }),
    );
  });

  it("rejects QR payloads with no importable keys", async () => {
    const { ConcealWalletService } = await import(
      "@/services/conceal/ConcealWalletService"
    );

    await expect(
      ConcealWalletService.importWallet({
        method: "qr",
        qr: "conceal.ccx7ADDR?height=1",
        password: "StrongPassword1!",
      }),
    ).rejects.toThrow(/Unsupported QR wallet payload/i);
  });
});

describe("ConcealWalletService.importWallet file", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each([1, 2, 3] as const)(
    "opens Envelope %s text with the backup password and adopts with the new password",
    async (envelope) => {
      const keys = {
        pub: { spend: "a", view: "b" },
        priv: { spend: "c", view: "d" },
      };
      const raw = { transactions: [], creationHeight: 12 };
      openEncryptedWalletFileMock.mockReturnValue({ raw, keys, envelope });
      encodeCcxAddressMock.mockReturnValue("ccx7imported");
      mnemonicFromSpendKeyMock.mockReturnValue("seed words");
      adoptMock.mockResolvedValue(undefined);

      const { ConcealWalletService } = await import(
        "@/services/conceal/ConcealWalletService"
      );

      await ConcealWalletService.importWallet({
        method: "file",
        file: ' \uFEFF{"data":[]} ',
        password: "legacy-backup-password",
        newPassword: "NewLocalPassword1!",
      });

      expect(ensureWasmReadyMock).toHaveBeenCalled();
      expect(openEncryptedWalletFileMock).toHaveBeenCalledWith(
        ' \uFEFF{"data":[]} ',
        "legacy-backup-password",
      );
      expect(adoptMock).toHaveBeenCalledWith(
        expect.objectContaining({
          raw,
          keys,
          password: "NewLocalPassword1!",
        }),
      );
    },
  );
});

describe("ConcealWalletService.createWallet", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("persists directly with the user password", async () => {
    generateConcealMnemonicMock.mockResolvedValue("generated seed");
    buildFromMnemonicMock.mockReturnValue({
      keys: { pub: { spend: "a", view: "b" }, priv: { spend: "c", view: "d" } },
      raw: { transactions: [] },
      address: "ccx7created",
      mnemonic: "generated seed",
    });
    adoptMock.mockResolvedValue(undefined);

    const { ConcealWalletService } = await import(
      "@/services/conceal/ConcealWalletService"
    );

    await ConcealWalletService.createWallet("NewWalletPassword1!");

    expect(adoptMock).toHaveBeenCalledWith(
      expect.objectContaining({ password: "NewWalletPassword1!" }),
    );
  });
});
