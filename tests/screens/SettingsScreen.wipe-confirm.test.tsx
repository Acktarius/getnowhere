import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deleteWalletData = vi.fn(async () => undefined);
const resetAppData = vi.fn(async () => undefined);

vi.mock("@/services/storage/appDataLifecycle", () => ({
  deleteWalletData: () => deleteWalletData(),
  resetAppData: () => resetAppData(),
}));

/** BottomNav Exit imports this; stub so wipe tests never load `@/services`. */
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

vi.mock("@/services/conceal/ConcealWalletService", () => ({
  getInternalWalletNodeUrl: () => "https://example.node/",
  updateWalletSyncSettings: vi.fn(async () => undefined),
}));

vi.mock("@/services/conceal/sync", () => ({
  getRuntime: () => null,
}));

vi.mock("@/state/walletStore", () => ({
  useWalletStore: (
    selector: (s: {
      setNode: () => void;
      resync: () => Promise<void>;
      resyncFromCreationHeight: () => Promise<void>;
      resetAndRescanFromCreationHeight: () => Promise<void>;
      syncStatus: "idle" | "syncing" | "synced" | "error";
    }) => unknown,
  ) =>
    selector({
      setNode: vi.fn(),
      resync: vi.fn(async () => undefined),
      resyncFromCreationHeight: vi.fn(async () => undefined),
      resetAndRescanFromCreationHeight: vi.fn(async () => undefined),
      syncStatus: "synced",
    }),
}));

import { SettingsScreen } from "@/screens/settings/SettingsScreen";

function renderSettings() {
  return render(
    <MemoryRouter>
      <SettingsScreen />
    </MemoryRouter>,
  );
}

describe("SettingsScreen wipe confirms", () => {
  beforeEach(() => {
    deleteWalletData.mockClear();
    resetAppData.mockClear();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    vi.spyOn(window, "alert").mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("opens ConfirmModal for Delete wallet and does not call window.confirm", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: /Delete wallet/i }));

    expect(window.confirm).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(/removes your wallet, contacts, and rooms/i),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(deleteWalletData).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens ConfirmModal for Delete and resync", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(
      screen.getByRole("button", { name: /Delete and resync/i }),
    );

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(/clears all stored wallet transactions/i),
    ).toBeInTheDocument();
  });

  it("opens ConfirmModal for Reset app data; confirm runs resetAppData", async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(screen.getByRole("button", { name: /Reset app data/i }));

    expect(window.confirm).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(/removes your wallet, contacts, rooms, theme/i),
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", { name: /^Reset app data$/i }),
    );
    expect(resetAppData).toHaveBeenCalledTimes(1);
  });
});
