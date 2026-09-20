// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const { saveStoredWalletMock, serializeWalletStateMock } = vi.hoisted(() => ({
  saveStoredWalletMock: vi
    .fn<() => Promise<void>>()
    .mockResolvedValue(undefined),
  serializeWalletStateMock: vi.fn<() => string>().mockReturnValue("{}"),
}));

vi.mock("conceal-wallet-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("conceal-wallet-sdk")>();
  return {
    ...actual,
    saveStoredWallet: saveStoredWalletMock,
    serializeWalletState: serializeWalletStateMock,
  };
});

import {
  _setRuntimeForTest,
  type SdkRuntime,
  setWalletCreationHeight,
} from "@/services/conceal/sync/runtime";

function fakeStorage(): NonNullable<SdkRuntime["storage"]> {
  return {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
    keys: vi.fn(async () => []),
  };
}

function makeRt(creationHeight: number, tip: number): SdkRuntime {
  return {
    id: "default",
    account: { keys: {} } as SdkRuntime["account"],
    raw: { creationHeight, lastHeight: 0 } as SdkRuntime["raw"],
    state: {
      scannedHeight: 100,
      outputs: [{ amount: 1 }],
      spentKeyImages: [],
      transactions: [{ hash: "tx1" }],
      deposits: [],
      spentDepositRefs: [],
    } as unknown as SdkRuntime["state"],
    daemon: {
      getHeight: vi.fn(async () => tip),
    } as unknown as SdkRuntime["daemon"],
    password: "pw",
    viewOnly: false,
    storage: fakeStorage(),
  };
}

describe("setWalletCreationHeight", () => {
  afterEach(() => {
    vi.clearAllMocks();
    _setRuntimeForTest(null);
  });

  it("clamps to [0, tip), persists, and leaves scan state alone", async () => {
    const rt = makeRt(0, 2_000_000);
    _setRuntimeForTest(rt);

    const saved = await setWalletCreationHeight(2_500_000);

    expect(saved).toBe(1_999_999);
    expect(rt.raw.creationHeight).toBe(1_999_999);
    expect(rt.state.scannedHeight).toBe(100);
    expect(rt.state.transactions).toHaveLength(1);
    expect(saveStoredWalletMock).toHaveBeenCalled();
  });

  it("stores a raised height below tip for later resync", async () => {
    const rt = makeRt(0, 2_000_000);
    _setRuntimeForTest(rt);

    const saved = await setWalletCreationHeight(1_971_774);

    expect(saved).toBe(1_971_774);
    expect(rt.raw.creationHeight).toBe(1_971_774);
    expect(rt.state.scannedHeight).toBe(100);
  });
});
