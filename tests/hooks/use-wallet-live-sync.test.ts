import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  refreshRelays,
  refreshInvites,
  refreshBalance,
  refreshTransactions,
  resetSession,
  setState,
} = vi.hoisted(() => ({
  refreshRelays: vi.fn().mockResolvedValue(undefined),
  refreshInvites: vi.fn().mockResolvedValue(undefined),
  refreshBalance: vi.fn().mockResolvedValue(undefined),
  refreshTransactions: vi.fn().mockResolvedValue(undefined),
  resetSession: vi.fn(),
  setState: vi.fn(),
}));

vi.mock("../../src/services/conceal/sync/runtime", () => ({
  sync: vi.fn().mockResolvedValue(100),
  getRuntime: vi.fn(() => ({ state: { scannedHeight: 100 } })),
}));

vi.mock("../../src/state/chatStore", () => ({
  useChatStore: (fn: (s: { refreshRelays: typeof refreshRelays }) => unknown) =>
    fn({ refreshRelays }),
}));

vi.mock("../../src/state/contactsStore", () => ({
  useContactsStore: (
    fn: (s: { refreshInvites: typeof refreshInvites }) => unknown,
  ) => fn({ refreshInvites }),
}));

vi.mock("../../src/state/walletStore", () => {
  const state = {
    refreshBalance,
    refreshTransactions,
    syncStatus: "idle",
    syncProgress: 1,
  };
  const useWalletStore = (fn: (s: typeof state) => unknown) => fn(state);
  useWalletStore.getState = () => state;
  useWalletStore.setState = setState;
  return { useWalletStore };
});

vi.mock("../../src/state/notificationStore", () => ({
  useNotificationStore: {
    getState: () => ({ resetSession }),
  },
}));

import {
  BACKGROUND_POLL_MS,
  resolveWalletPollMs,
  useWalletLiveSync,
  WALLET_POLL_MS,
} from "../../src/hooks/useWalletLiveSync";

describe("useWalletLiveSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refreshRelays.mockClear();
    refreshInvites.mockClear();
    refreshBalance.mockClear();
    refreshTransactions.mockClear();
    setState.mockClear();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
  });

  it("resolveWalletPollMs uses background interval when hidden", () => {
    expect(resolveWalletPollMs(true, false)).toBe(BACKGROUND_POLL_MS);
    expect(resolveWalletPollMs(false, false)).toBe(WALLET_POLL_MS[1]);
    expect(resolveWalletPollMs(false, true)).toBe(WALLET_POLL_MS[0]);
  });

  it("awaits sync then always refreshes balance+relays (even when hidden)", async () => {
    renderHook(() => useWalletLiveSync(true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(refreshRelays).toHaveBeenCalled();
    expect(refreshInvites).toHaveBeenCalled();
    expect(refreshBalance).toHaveBeenCalled();
    expect(setState).toHaveBeenCalled();
  });

  it("awaits sync then refreshes balance when visible", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    renderHook(() => useWalletLiveSync(true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(refreshBalance).toHaveBeenCalled();
    expect(setState).toHaveBeenCalled();
  });
});
