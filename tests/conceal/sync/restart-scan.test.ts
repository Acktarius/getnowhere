// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const { saveStoredWalletMock } = vi.hoisted(() => ({
  saveStoredWalletMock: vi
    .fn<() => Promise<void>>()
    .mockResolvedValue(undefined),
}));

vi.mock("conceal-wallet-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("conceal-wallet-sdk")>();
  return {
    ...actual,
    saveStoredWallet: saveStoredWalletMock,
  };
});

import {
  _setRuntimeForTest,
  restartScanFromCreationHeight,
  type SdkRuntime,
  syncRuntime,
} from "@/services/conceal/sync/runtime";

function fakeStorage(): NonNullable<SdkRuntime["storage"]> {
  return {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
    keys: vi.fn(async () => []),
  };
}

describe("restartScanFromCreationHeight", () => {
  afterEach(() => {
    vi.clearAllMocks();
    _setRuntimeForTest(null);
  });

  it("drops the in-flight scan and continues from the new height", async () => {
    let releaseFirst: () => void = () => {};
    let syncCalls = 0;
    const rt = {
      id: "default",
      account: { keys: { spend: {}, view: {} }, address: "ccx1" },
      raw: {
        creationHeight: 0,
        lastHeight: 0,
        deposits: [],
        withdrawals: [],
        transactions: [],
        nonce: "",
        options: { customNode: true, nodeUrl: "https://node.example/" },
      },
      state: {
        scannedHeight: 100,
        outputs: [{ amount: 1 }],
        spentKeyImages: ["ki"],
        transactions: [{ hash: "tx1" }],
        deposits: [],
        spentDepositRefs: [],
      },
      daemon: {
        nodeUrl: "https://node.example/",
        getHeight: vi.fn(async () => 2_000),
        getTransactionsPool: vi.fn(async () => []),
        getWalletSyncData: vi.fn(() => {
          syncCalls += 1;
          if (syncCalls === 1) {
            return new Promise<unknown[]>((resolve) => {
              releaseFirst = () => resolve([]);
            });
          }
          return Promise.resolve([]);
        }),
      },
      password: "pw",
      viewOnly: false,
      storage: fakeStorage(),
    } as unknown as SdkRuntime;
    _setRuntimeForTest(rt);

    const running = syncRuntime(rt);
    await vi.waitFor(() => {
      expect(syncCalls).toBe(1);
    });

    const restart = restartScanFromCreationHeight(1_500, rt);
    releaseFirst();
    await expect(restart).resolves.toBe(1_500);
    await running;

    expect(rt.raw.creationHeight).toBe(1_500);
    expect(rt.state.transactions).toEqual([]);
    expect(rt.state.outputs).toEqual([]);
    expect(rt.state.scannedHeight).toBeGreaterThanOrEqual(1_500);
  });
});
