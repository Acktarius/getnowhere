// @vitest-environment node
import type { RawWalletV1, WalletState } from "conceal-wallet-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  pollMempoolRuntime,
  type SdkRuntime,
} from "@/services/conceal/sync/runtime";

function hangingRuntime(): SdkRuntime {
  return {
    id: "default",
    account: { keys: {} } as SdkRuntime["account"],
    raw: {} as RawWalletV1,
    state: { transactions: [] } as unknown as WalletState,
    daemon: {
      getTransactionsPool: () => new Promise(() => {}),
    } as SdkRuntime["daemon"],
    password: "pw",
    viewOnly: false,
  };
}

describe("pollMempoolRuntime pool timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns without blocking when the pool RPC never settles", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers();
    const pending = pollMempoolRuntime(hangingRuntime());
    await vi.advanceTimersByTimeAsync(8_000);
    await expect(pending).resolves.toBe(false);
  });
});
