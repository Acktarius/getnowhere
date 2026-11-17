import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/storage/appDataLifecycle", () => ({
  deleteWalletData: vi.fn(async () => undefined),
  resetAppData: vi.fn(async () => undefined),
}));

vi.mock("@/services/storage/walletSessionExit", () => ({
  runWalletSessionExit: vi.fn(async () => undefined),
  walletSessionExit: vi.fn(async () => undefined),
}));

vi.mock("@/lib/network/auto-node", () => ({
  refreshAutoNode: vi.fn(async () => undefined),
}));

vi.mock("@/lib/network/node-preference", () => ({
  setPreferredNode: vi.fn(),
}));

const {
  setWalletCreationHeight,
  clampWalletCreationHeight,
  restartScanFromCreationHeight,
  settingsHarness,
} = vi.hoisted(() => ({
  setWalletCreationHeight: vi.fn(async (h: number) => h),
  clampWalletCreationHeight: vi.fn(async (h: number) => h),
  restartScanFromCreationHeight: vi.fn(async (h: number) => h),
  settingsHarness: {
    syncStatus: "synced" as "idle" | "syncing" | "synced" | "error",
  },
}));

vi.mock("@/services/conceal/ConcealWalletService", () => ({
  getInternalWalletNodeUrl: () => "https://example.node/",
  updateWalletSyncSettings: vi.fn(async () => undefined),
  setWalletCreationHeight: (h: number) => setWalletCreationHeight(h),
  clampWalletCreationHeight: (h: number) => clampWalletCreationHeight(h),
}));

vi.mock("@/hooks/useNavNotificationBadges", () => ({
  useNavNotificationBadges: () => ({
    contactsUnread: false,
    chatsUnread: false,
  }),
}));

vi.mock("@/services/conceal/sync", () => ({
  getRuntime: () => ({
    raw: {
      creationHeight: 0,
      options: { readSpeed: 0, checkMinerTx: false },
    },
    daemon: { getHeight: vi.fn(async () => 2_000_000) },
  }),
}));

vi.mock("@/state/walletStore", () => ({
  useWalletStore: (
    selector: (s: {
      setNode: () => void;
      resync: () => Promise<void>;
      resyncFromCreationHeight: () => Promise<void>;
      resetAndRescanFromCreationHeight: () => Promise<void>;
      restartScanFromCreationHeight: (height: number) => Promise<number>;
      syncStatus: "idle" | "syncing" | "synced" | "error";
    }) => unknown,
  ) =>
    selector({
      setNode: vi.fn(),
      resync: vi.fn(async () => undefined),
      resyncFromCreationHeight: vi.fn(async () => undefined),
      resetAndRescanFromCreationHeight: vi.fn(async () => undefined),
      restartScanFromCreationHeight: (height: number) =>
        restartScanFromCreationHeight(height),
      syncStatus: settingsHarness.syncStatus,
    }),
}));

import { SettingsScreen } from "@/screens/settings/SettingsScreen";

describe("SettingsScreen creation height edit", () => {
  beforeEach(() => {
    settingsHarness.syncStatus = "synced";
    setWalletCreationHeight.mockClear();
    clampWalletCreationHeight.mockClear();
    restartScanFromCreationHeight.mockClear();
    setWalletCreationHeight.mockImplementation(async (h: number) => h);
    clampWalletCreationHeight.mockImplementation(async (h: number) => h);
    restartScanFromCreationHeight.mockImplementation(async (h: number) => h);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("lets the user edit and persist creation height without resync", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SettingsScreen />
      </MemoryRouter>,
    );

    await user.click(
      screen.getByRole("button", { name: /Edit creation height/i }),
    );
    const input = screen.getByRole("textbox", { name: /Creation height/i });
    await user.clear(input);
    await user.type(input, "1971774");
    await user.tab();

    expect(setWalletCreationHeight).toHaveBeenCalledWith(1971774);
    expect(restartScanFromCreationHeight).not.toHaveBeenCalled();
  });

  it("asks before restarting a scan that is already running", async () => {
    settingsHarness.syncStatus = "syncing";
    clampWalletCreationHeight.mockImplementation(async () => 1_971_774);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SettingsScreen />
      </MemoryRouter>,
    );

    await user.click(
      screen.getByRole("button", { name: /Edit creation height/i }),
    );
    const input = screen.getByRole("textbox", { name: /Creation height/i });
    await user.clear(input);
    await user.type(input, "1971774");
    await user.tab();

    expect(setWalletCreationHeight).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Discard the transactions found so far and start a new scan from 1971774?",
      ),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Restart scan" }));

    expect(restartScanFromCreationHeight).toHaveBeenCalledWith(1_971_774);
  });

  it("leaves the running scan alone when restart is cancelled", async () => {
    settingsHarness.syncStatus = "syncing";
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SettingsScreen />
      </MemoryRouter>,
    );

    await user.click(
      screen.getByRole("button", { name: /Edit creation height/i }),
    );
    const input = screen.getByRole("textbox", { name: /Creation height/i });
    await user.clear(input);
    await user.type(input, "50");
    await user.tab();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(restartScanFromCreationHeight).not.toHaveBeenCalled();
    expect(setWalletCreationHeight).not.toHaveBeenCalled();
  });
});
