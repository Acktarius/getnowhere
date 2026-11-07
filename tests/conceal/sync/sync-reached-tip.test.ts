import { beforeEach, describe, expect, it, vi } from "vitest";

const { getState, setState } = vi.hoisted(() => ({
  getState: vi.fn(),
  setState: vi.fn(),
}));

vi.mock("@/state/walletStore", () => ({
  useWalletStore: { getState, setState },
}));

import { notifySyncReachedTip } from "@/services/conceal/sync/history-publish";

describe("notifySyncReachedTip", () => {
  beforeEach(() => {
    getState.mockReset();
    setState.mockReset();
  });

  it("marks the wallet synced when the label is still syncing", async () => {
    getState.mockReturnValue({ syncStatus: "syncing" });
    notifySyncReachedTip();
    await vi.waitFor(() => expect(setState).toHaveBeenCalledOnce());
    expect(setState).toHaveBeenCalledWith(
      expect.objectContaining({
        syncStatus: "synced",
        syncProgress: 1,
      }),
    );
  });

  it("does not overwrite a status that already left syncing", async () => {
    getState.mockReturnValue({ syncStatus: "error" });
    notifySyncReachedTip();
    await Promise.resolve();
    await Promise.resolve();
    expect(setState).not.toHaveBeenCalled();
  });
});
