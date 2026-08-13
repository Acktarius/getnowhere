import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refreshRelays = vi.fn().mockResolvedValue(undefined);
const refreshInvites = vi.fn().mockResolvedValue(undefined);
const refreshBalance = vi.fn().mockResolvedValue(undefined);
const resetSession = vi.fn();

vi.mock("../../src/services/conceal/sync/runtime", () => ({
  sync: vi.fn().mockResolvedValue(0),
  getRuntime: vi.fn(() => ({})),
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

vi.mock("../../src/state/walletStore", () => ({
  useWalletStore: (
    fn: (s: {
      refreshBalance: typeof refreshBalance;
      syncStatus: string;
      syncProgress: number;
    }) => unknown,
  ) =>
    fn({
      refreshBalance,
      syncStatus: "idle",
      syncProgress: 1,
    }),
}));

vi.mock("../../src/state/notificationStore", () => ({
  useNotificationStore: {
    getState: () => ({ resetSession }),
  },
}));

import {
  BACKGROUND_POLL_MS,
  resolveWalletPollMs,
  useWalletLiveSync,
} from "../../src/hooks/useWalletLiveSync";

describe("useWalletLiveSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refreshRelays.mockClear();
    refreshInvites.mockClear();
    refreshBalance.mockClear();
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
    expect(resolveWalletPollMs(false, false)).toBe(20_000);
    expect(resolveWalletPollMs(false, true)).toBe(2500);
  });

  it("calls refreshRelays when tab is hidden", async () => {
    renderHook(() => useWalletLiveSync(true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(refreshRelays).toHaveBeenCalled();
    expect(refreshInvites).toHaveBeenCalled();
    expect(refreshBalance).not.toHaveBeenCalled();
  });
});
