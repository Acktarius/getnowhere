// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const adoptMock = vi.fn();
const buildFromSpendKeyMock = vi.fn();
const ensureWasmReadyMock = vi.fn();

vi.mock("@/services/conceal/ConcealWalletAdapter", () => ({
  ensureWasmReady: ensureWasmReadyMock,
  openEncryptedWalletFile: vi.fn(),
  encodeCcxAddress: vi.fn(),
  previewKeysFromSpend: vi.fn(),
  validateCcxAddress: vi.fn(),
  buildDaemon: vi.fn(),
  createConcealAccount: vi.fn(),
  DEFAULT_DAEMON_NODES: [],
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
  buildFromMnemonic: vi.fn(),
  buildFromSpendKey: buildFromSpendKeyMock,
  buildViewOnly: vi.fn(),
  mnemonicFromSpendKey: vi.fn(),
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
      password: "StrongPass1!",
    });

    expect(buildFromSpendKeyMock).toHaveBeenCalledWith(spendKey, "", 42);
    expect(adoptMock).toHaveBeenCalledWith(
      expect.objectContaining({ password: "StrongPass1!" }),
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
        password: "StrongPass1!",
      }),
    ).rejects.toThrow(/Unsupported QR wallet payload/i);
  });
});
