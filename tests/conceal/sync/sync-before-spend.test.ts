/**
 * Sync-before-spend skips the pass at tip and syncs first only when behind.
 * @see openspec/changes/accept-invite-fast-open/specs/wallet-live-sync/spec.md
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WALLET_DONATION_ADDRESS } from "@/lib/config";

const NETWORK_HEIGHT = 50_000;
/** Spec: at most 2 blocks behind sends without a sync pass. */
const MAX_LAG_WITHOUT_SYNC = 2;

const calls: string[] = [];
async function recordSync(): Promise<number> {
  calls.push("sync");
  return 0;
}
const syncRuntime = vi.fn(recordSync);
const getHeight = vi.fn(async () => NETWORK_HEIGHT);

const runtime = {
  raw: {},
  viewOnly: false,
  account: {
    address: "ccx-own",
    keys: { spend: { pub: "aa" }, view: { pub: "bb" } },
  },
  state: {
    scannedHeight: NETWORK_HEIGHT,
    outputs: [],
    spentKeyImages: [],
    transactions: [],
  },
  daemon: {
    getHeight: () => getHeight(),
    getNodeFeeAddress: async () => "",
  },
};

vi.mock("@/services/conceal/sync/runtime", () => ({
  getRuntime: () => runtime,
  requireRuntime: () => runtime,
  persistRuntime: async () => undefined,
  decoysFromDaemon: () => [],
  syncRuntime: (...args: unknown[]) => syncRuntime(...(args as [])),
}));

vi.mock("@/services/conceal/sync/pending-store", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/services/conceal/sync/pending-store")
    >();
  return {
    ...actual,
    pendingSpentKeyImages: (
      ...args: Parameters<typeof actual.pendingSpentKeyImages>
    ) => {
      calls.push("select");
      return actual.pendingSpentKeyImages(...args);
    },
  };
});

import { sendCcx, sendSmartMessage } from "@/services/conceal/sync/spend";

const NO_OUTPUTS = /No spendable outputs/;

function setLag(lagBlocks: number): void {
  runtime.state.scannedHeight = NETWORK_HEIGHT - lagBlocks;
}

function sendOneCcx(): Promise<unknown> {
  return sendCcx({ toAddress: WALLET_DONATION_ADDRESS, amount: 1 });
}

/** Resolves "blocked" when `promise` has not settled within a few ticks. */
async function settlesPromptly(promise: Promise<unknown>): Promise<boolean> {
  const outcome = await Promise.race([
    promise.then(
      () => "settled",
      () => "settled",
    ),
    new Promise<string>((resolve) => setTimeout(() => resolve("blocked"), 50)),
  ]);
  return outcome === "settled";
}

beforeEach(() => {
  calls.length = 0;
  syncRuntime.mockReset();
  syncRuntime.mockImplementation(recordSync);
  getHeight.mockReset();
  getHeight.mockImplementation(async () => NETWORK_HEIGHT);
  setLag(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("syncBeforeSpend at tip", () => {
  it("sends without calling syncRuntime when the wallet is at the tip", async () => {
    setLag(0);
    await expect(sendOneCcx()).rejects.toThrow(NO_OUTPUTS);
    expect(syncRuntime).not.toHaveBeenCalled();
    expect(calls).toEqual(["select"]);
  });

  it("sends without a sync pass at the largest allowed lag", async () => {
    setLag(MAX_LAG_WITHOUT_SYNC);
    await expect(sendOneCcx()).rejects.toThrow(NO_OUTPUTS);
    expect(syncRuntime).not.toHaveBeenCalled();
  });

  it("smart message at tip does not call syncRuntime", async () => {
    setLag(0);
    await expect(
      sendSmartMessage({
        recipientAddress: WALLET_DONATION_ADDRESS,
        body: "hi",
      }),
    ).rejects.toThrow(NO_OUTPUTS);
    expect(syncRuntime).not.toHaveBeenCalled();
    expect(calls).toEqual(["select"]);
  });

  it("does not wait for a sync pass that is already running", async () => {
    setLag(0);
    syncRuntime.mockImplementation(() => {
      calls.push("sync");
      return new Promise<number>(() => {});
    });
    void syncRuntime(runtime as never);
    const send = sendOneCcx();
    expect(await settlesPromptly(send)).toBe(true);
    await expect(send).rejects.toThrow(NO_OUTPUTS);
    expect(syncRuntime).toHaveBeenCalledOnce();
    expect(calls).toEqual(["sync", "select"]);
  });
});

describe("syncBeforeSpend behind the tip", () => {
  it("syncs before selecting inputs one block past the allowed lag", async () => {
    setLag(MAX_LAG_WITHOUT_SYNC + 1);
    await expect(sendOneCcx()).rejects.toThrow(NO_OUTPUTS);
    expect(syncRuntime).toHaveBeenCalledOnce();
    expect(syncRuntime).toHaveBeenCalledWith(runtime);
    expect(calls).toEqual(["sync", "select"]);
  });

  it("syncs before a smart message when far behind", async () => {
    setLag(MAX_LAG_WITHOUT_SYNC + 500);
    await expect(
      sendSmartMessage({
        recipientAddress: WALLET_DONATION_ADDRESS,
        body: "hi",
      }),
    ).rejects.toThrow(NO_OUTPUTS);
    expect(syncRuntime).toHaveBeenCalledOnce();
    expect(calls).toEqual(["sync", "select"]);
  });

  it("a failed height request falls back to the bounded sync", async () => {
    getHeight.mockRejectedValue(new Error("daemon down"));
    setLag(0);
    await expect(sendOneCcx()).rejects.toThrow(NO_OUTPUTS);
    expect(syncRuntime).toHaveBeenCalledOnce();
    expect(calls).toEqual(["sync", "select"]);
  });

  it("a hung height request falls back to the bounded sync", async () => {
    vi.useFakeTimers();
    getHeight.mockImplementation(() => new Promise<number>(() => {}));
    setLag(0);
    const send = sendOneCcx();
    const settled = send.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(syncRuntime).toHaveBeenCalledOnce();
    expect(await settled).toBeInstanceOf(Error);
    expect(calls).toEqual(["sync", "select"]);
  });
});
