import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const applyPushWakeEnabled = vi.fn();

vi.mock("@/services/poke/applyPushWakeSetting", () => ({
  applyPushWakeEnabled: (on: boolean) => applyPushWakeEnabled(on),
}));

vi.mock("@/services/storage/appDataLifecycle", () => ({
  deleteWalletData: vi.fn(async () => undefined),
  resetAppData: vi.fn(async () => undefined),
}));

vi.mock("@/services/storage/walletSessionExit", () => ({
  runWalletSessionExit: vi.fn(async () => undefined),
  walletSessionExit: vi.fn(async () => undefined),
}));

vi.mock("@/services/notifications/publishBackgroundNotification", () => ({
  onNotificationPrivacyChanged: vi.fn(),
}));

vi.mock("@/lib/mobile/gnhMobileBridgeTypes", () => ({
  isMobileHost: () => true,
}));

vi.mock("@/lib/mobile/nativeNotificationsBridge", () => ({
  bridgeRequestNotificationPermissions: vi.fn(),
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

function renderSettings() {
  return render(
    <MemoryRouter>
      <SettingsScreen />
    </MemoryRouter>,
  );
}

describe("SettingsScreen push wake toggle", () => {
  beforeEach(() => {
    getStorage().removeItem("gnh.settings");
    applyPushWakeEnabled.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders Wake contact on mobile host", () => {
    renderSettings();
    expect(screen.getByText("Wake contact")).toBeTruthy();
  });

  it("toggle is disabled (no switch) when Notifications is off", () => {
    renderSettings();
    expect(
      screen.queryByRole("switch", { name: /^wake contact$/i }),
    ).toBeNull();
    expect(
      screen.getAllByText("Turn on Notifications first.").length,
    ).toBeGreaterThan(0);
  });

  it("describes wake as accepted-invite and new-message ping when Notifications is on", () => {
    useSettingsStore.getState().setPrivacy({ notificationsEnabled: true });
    renderSettings();
    expect(
      screen.getByText(
        "Generic APNs/ntfy ping when a room invite is accepted or a room gets a new message. No names or preview.",
      ),
    ).toBeTruthy();
  });

  it("describes banner as invite-received only when Notifications is on", () => {
    useSettingsStore.getState().setPrivacy({ notificationsEnabled: true });
    renderSettings();
    expect(
      screen.getByText(
        'Local lock-screen alert only for “You received a room invite.”',
      ),
    ).toBeTruthy();
  });

  it("calls applyPushWakeEnabled when toggled with Notifications on", async () => {
    useSettingsStore.getState().setPrivacy({ notificationsEnabled: true });
    const user = userEvent.setup();
    renderSettings();
    const toggle = screen.getByRole("switch", {
      name: /^wake contact$/i,
    });
    await user.click(toggle);
    expect(applyPushWakeEnabled).toHaveBeenCalledWith(true);
  });
});
