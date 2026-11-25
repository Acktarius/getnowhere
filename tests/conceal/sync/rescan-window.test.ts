// @vitest-environment node
import type { RawWalletV1, WalletState } from "conceal-wallet-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

const { saveStoredWalletMock, applyScannedTransactionMock } = vi.hoisted(
  () => ({
    saveStoredWalletMock: vi
      .fn<[], Promise<void>>()
      .mockResolvedValue(undefined),
    applyScannedTransactionMock: vi.fn(
      (state: WalletState, tx: { hash: string; height: number }) => ({
        ...state,
        transactions: [...state.transactions, tx],
      }),
    ),
  }),
);

vi.mock("conceal-wallet-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("conceal-wallet-sdk")>();
  return {
    ...actual,
    saveStoredWallet: saveStoredWalletMock,
    serializeWalletState: () => "{}",
    applyScannedTransaction: applyScannedTransactionMock,
    transactions: {
      ...actual.transactions,
      readMessageFromTransaction: () => null,
    },
  };
});

vi.mock("@/services/conceal/sync/scan-pool", () => ({
  desiredPoolSize: () => 0,
  terminateScanPool: () => {},
  scanBatch: async (rawTxs: { hash: string; height: number }[]) =>
    rawTxs.map((raw) => ({
      scanTx: { hash: raw.hash, height: raw.height },
      rawTransaction: {},
      fee: 0,
      ownedOutputs: [{}],
      ownedDeposits: [],
      inputKeyImages: [],
      depositInputs: [],
      timestamp: 0,
    })),
}));

vi.mock("@/services/conceal/sync/sync-flags", () => ({
  parallelSyncDisabled: () => true,
  syncTimingEnabled: () => false,
}));

vi.mock("@/services/conceal/sync/history-publish", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/services/conceal/sync/history-publish")
  >()),
  notifyHistoryPossiblyChanged: () => {},
  notifySyncReachedTip: () => {},
}));

import { type SdkRuntime, syncRuntime } from "@/services/conceal/sync/runtime";

/** Spec `wallet-live-sync`: each pass re-scans this many real blocks below the cursor. */
const SPEC_RESCAN_REAL_BLOCKS = 3;

type ChainTx = { hash: string; height: number };
type DaemonEvent = "height" | "pool" | "blocks";

interface Fixture {
  tip: number;
  scannedHeight: number;
  creationHeight?: number;
  chain?: ChainTx[];
}

let runtimeSeq = 0;

function makeRuntime(fixture: Fixture) {
  const events: DaemonEvent[] = [];
  const blockStarts: number[] = [];
  const chain = fixture.chain ?? [];
  const daemon = {
    getHeight: vi.fn(async () => {
      events.push("height");
      return fixture.tip;
    }),
    getTransactionsPool: vi.fn(async () => {
      events.push("pool");
      return [];
    }),
    getWalletSyncData: vi.fn(async (start: number, end: number) => {
      events.push("blocks");
      blockStarts.push(start);
      return chain.filter((tx) => tx.height >= start && tx.height < end);
    }),
  };
  runtimeSeq += 1;
  const rt: SdkRuntime = {
    id: `rescan-window-${runtimeSeq}`,
    account: { keys: {} } as SdkRuntime["account"],
    raw: { creationHeight: fixture.creationHeight ?? 0 } as RawWalletV1,
    state: {
      scannedHeight: fixture.scannedHeight,
      outputs: [],
      transactions: [],
      spentKeyImages: [],
      deposits: [],
      spentDepositRefs: [],
    } as unknown as WalletState,
    daemon: daemon as unknown as SdkRuntime["daemon"],
    password: "pw",
    viewOnly: false,
    storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  };
  const foldedHashes = () => rt.state.transactions.map((tx) => tx.hash);
  return { rt, daemon, events, blockStarts, foldedHashes };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("syncOnce rescan window", () => {
  it("at the tip requests from the last real blocks below scannedHeight and folds a late-indexed tx", async () => {
    // At the tip `scannedHeight` is the block COUNT: real block indices end at `tip - 1`.
    const tip = 50_000;
    const lateHeight = tip - SPEC_RESCAN_REAL_BLOCKS;
    const { rt, blockStarts, foldedHashes } = makeRuntime({
      tip,
      scannedHeight: tip,
      chain: [
        { hash: "outside-window", height: lateHeight - 1 },
        { hash: "late-indexed", height: lateHeight },
      ],
    });

    await syncRuntime(rt);

    expect(blockStarts[0]).toBe(lateHeight);
    expect(foldedHashes()).toEqual(["late-indexed"]);
  });

  it("never re-scans below the wallet creation height", async () => {
    const tip = 50_000;
    const creationHeight = tip - 1;
    const { rt, blockStarts, foldedHashes } = makeRuntime({
      tip,
      scannedHeight: tip,
      creationHeight,
      chain: [
        { hash: "pre-creation", height: creationHeight - 1 },
        { hash: "at-creation", height: creationHeight },
      ],
    });

    await syncRuntime(rt);

    expect(blockStarts[0]).toBe(creationHeight);
    expect(foldedHashes()).toEqual(["at-creation"]);
  });
});

describe("syncOnce mempool poll", () => {
  it("fetches the pool once per pass at the tip, after the block fold", async () => {
    const tip = 50_000;
    const { rt, daemon, events } = makeRuntime({ tip, scannedHeight: tip });

    await syncRuntime(rt);

    expect(daemon.getTransactionsPool).toHaveBeenCalledTimes(1);
    expect(events.indexOf("pool")).toBeGreaterThan(
      events.lastIndexOf("blocks"),
    );
  });

  it("when far behind, reads the height first and polls the pool before and after the catch-up", async () => {
    // A fresh wallet at block 0 against a tip far past the deep-catch-up threshold.
    const tip = 20_000;
    const { rt, daemon, events } = makeRuntime({ tip, scannedHeight: 0 });

    await syncRuntime(rt);

    expect(daemon.getTransactionsPool).toHaveBeenCalledTimes(2);
    expect(events.slice(0, 2)).toEqual(["height", "pool"]);
    expect(events.indexOf("blocks")).toBeGreaterThan(events.indexOf("pool"));
    expect(events.at(-1)).toBe("pool");
  });
});
