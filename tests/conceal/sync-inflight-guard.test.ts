import type { RawWalletV1 } from "conceal-wallet-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const syncRuntime = vi.fn(async () => 0);
let inFlight = false;

vi.mock("@/services/conceal/sync/runtime", () => ({
  requireRuntime: () => ({ raw: {} as RawWalletV1 }),
  pollMempoolRuntime: async () => false,
  syncRuntime: (...args: unknown[]) => syncRuntime(...args),
  isSyncInProgress: () => inFlight,
}));

import { ConcealSmartMessageAdapter } from "@/services/conceal/ConcealSmartMessageAdapter";

describe("message polls do not re-arm an in-flight sync", () => {
  beforeEach(() => {
    syncRuntime.mockClear();
    inFlight = false;
  });

  it("starts a tip sync when the wallet is idle", async () => {
    await ConcealSmartMessageAdapter.fetchIncomingRelays();
    expect(syncRuntime).toHaveBeenCalledOnce();
  });

  it("skips syncRuntime while a scan is already running", async () => {
    inFlight = true;
    await ConcealSmartMessageAdapter.fetchIncomingRelays();
    await ConcealSmartMessageAdapter.fetchIncomingRevokes();
    await ConcealSmartMessageAdapter.fetchIncomingMessages();
    expect(syncRuntime).not.toHaveBeenCalled();
  });
});
