import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clearClipboard = vi.fn(async () => undefined);

vi.mock("@/lib/clipboard/sensitiveClipboard", () => ({
  clearClipboard: () => clearClipboard(),
}));

vi.mock("@/services/storage/appDataLifecycle", () => ({
  deleteWalletData: vi.fn(async () => undefined),
  resetAppData: vi.fn(async () => undefined),
}));

/** BottomNav Exit imports this; stub so settings tests never load `@/services`. */
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

/** Settings BottomNav uses nav badges — avoid pulling chatStore → @/services. */
vi.mock("@/hooks/useNavNotificationBadges", () => ({
  useNavNotificationBadges: () => ({
    contactsUnread: false,
    chatsUnread: false,
  }),
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
import { getStorage } from "@/services/storage/StorageAdapter";
import { useSettingsStore } from "@/state/settingsStore";

const TIPS_OFF = "Toast after you copy a sensitive value.";
const TIPS_ON =
  "Toast after you copy a sensitive value. On Android and desktop, it points to Clear clipboard when you finish pasting.";

function renderSettings() {
  return render(
    <MemoryRouter>
      <SettingsScreen />
    </MemoryRouter>,
  );
}

describe("SettingsScreen clipboard reminder", () => {
  beforeEach(() => {
    getStorage().removeItem("gnh.settings");
    useSettingsStore.getState().reset();
    clearClipboard.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows Clipboard reminder and not the old Clear clipboard warnings title", () => {
    renderSettings();

    expect(screen.getByText("Clipboard reminder")).toBeInTheDocument();
    expect(
      screen.queryByText("Clear clipboard warnings"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Clipboard reminder" }),
    ).toBeInTheDocument();
  });

  it("shows tips-on hint copy when tips are on", () => {
    useSettingsStore.getState().setShowTips(true);
    renderSettings();

    expect(screen.getByText(TIPS_ON)).toBeInTheDocument();
  });

  it("shows tips-off hint copy when tips are off", () => {
    useSettingsStore.getState().setShowTips(false);
    renderSettings();

    expect(screen.getByText(TIPS_OFF)).toBeInTheDocument();
    expect(screen.queryByText(TIPS_ON)).not.toBeInTheDocument();
  });

  it("toggles the persisted clearClipboardWarnings flag", async () => {
    const user = userEvent.setup();
    renderSettings();

    expect(useSettingsStore.getState().privacy.clearClipboardWarnings).toBe(
      true,
    );
    await user.click(
      screen.getByRole("switch", { name: "Clipboard reminder" }),
    );
    expect(useSettingsStore.getState().privacy.clearClipboardWarnings).toBe(
      false,
    );
  });

  it("Clear clipboard states it wipes whatever is on the clipboard and calls clearClipboard", async () => {
    const user = userEvent.setup();
    renderSettings();

    expect(
      screen.getByText(/clears whatever is on the clipboard/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Clear clipboard/i }));
    expect(clearClipboard).toHaveBeenCalledTimes(1);
  });
});
