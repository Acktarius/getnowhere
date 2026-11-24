import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationPermissionReply } from "@/services/notifications/nativeNotificationTypes";

const requestNotificationPermission = vi.fn();
const getNotificationPermissionStatus = vi.fn();
const registerPokeHandle = vi.fn();

vi.mock("@/lib/mobile/nativeNotificationsBridge", () => ({
  requestNotificationPermission: (...args: unknown[]) =>
    requestNotificationPermission(...args),
  getNotificationPermissionStatus: (...args: unknown[]) =>
    getNotificationPermissionStatus(...args),
}));

vi.mock("@/services/poke/pokeGatewayClient", () => ({
  registerPokeHandle: (...args: unknown[]) => registerPokeHandle(...args),
  deletePokeHandle: vi.fn(async () => undefined),
}));

vi.mock("@/lib/mobile/ntfyWakeBridge", () => ({
  subscribeAll: vi.fn(),
  unsubscribeAll: vi.fn(),
}));

let mockIsMobileHost = true;

vi.mock("@/lib/mobile/gnhMobileBridgeTypes", () => ({
  isMobileHost: () => mockIsMobileHost,
  isMobileAndroid: () => false,
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

vi.mock("@/lib/network/auto-node", () => ({
  refreshAutoNode: vi.fn(async () => undefined),
}));

vi.mock("@/lib/network/node-preference", () => ({
  setPreferredNode: vi.fn(),
}));

vi.mock("@/services/conceal/ConcealWalletService", () => ({
  getInternalWalletNodeUrl: () => "https://example.node/",
  updateWalletSyncSettings: vi.fn(async () => undefined),
  setWalletCreationHeight: vi.fn(async (h: number) => h),
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
import {
  NOTIFICATIONS_UNAVAILABLE_MESSAGE,
  PERMISSION_SETTINGS_MESSAGE,
} from "@/services/notifications/notificationToggleFlow";
import { getStorage } from "@/services/storage/StorageAdapter";
import { useSettingsStore } from "@/state/settingsStore";

const authorized: NotificationPermissionReply = {
  status: "authorized",
  alertEnabled: true,
};
const denied: NotificationPermissionReply = {
  status: "denied",
  alertEnabled: false,
};

let navigateTo: (path: string) => void = () => undefined;

function NavProbe() {
  navigateTo = useNavigate();
  return null;
}

/** Settings stays mounted across tab switches (keep-alive shell), so route changes matter. */
function renderSettings() {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <SettingsScreen />
      <NavProbe />
    </MemoryRouter>,
  );
}

function switchTabAwayAndBack(): void {
  act(() => navigateTo("/contacts"));
  act(() => navigateTo("/settings"));
}

function toggleSwitch(name: RegExp): HTMLElement {
  return screen.getByRole("switch", { name });
}

function rowOf(name: RegExp): HTMLElement {
  const row = toggleSwitch(name).closest(".privacy-setting-item");
  if (!(row instanceof HTMLElement)) throw new Error("row not found");
  return row;
}

describe("SettingsScreen notification permission toggles", () => {
  beforeEach(() => {
    getStorage().removeItem("gnh.settings");
    useSettingsStore.getState().reset();
    mockIsMobileHost = true;
    requestNotificationPermission.mockReset();
    getNotificationPermissionStatus.mockReset();
    getNotificationPermissionStatus.mockResolvedValue({
      status: "unavailable",
      alertEnabled: false,
    });
    registerPokeHandle.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("disables the switch and shows it off while the request is pending", async () => {
    let answer: (reply: NotificationPermissionReply) => void = () => undefined;
    requestNotificationPermission.mockImplementationOnce(
      () =>
        new Promise<NotificationPermissionReply>((resolve) => {
          answer = resolve;
        }),
    );
    const user = userEvent.setup();
    renderSettings();
    await user.click(toggleSwitch(/^notifications$/i));

    const pending = toggleSwitch(/^notifications$/i) as HTMLButtonElement;
    expect(pending.disabled).toBe(true);
    expect(pending.getAttribute("aria-checked")).toBe("false");
    expect(useSettingsStore.getState().privacy.notificationsEnabled).toBe(
      false,
    );

    answer(authorized);
    await waitFor(() =>
      expect(
        toggleSwitch(/^notifications$/i).getAttribute("aria-checked"),
      ).toBe("true"),
    );
    expect(
      (toggleSwitch(/^notifications$/i) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(useSettingsStore.getState().privacy.notificationsEnabled).toBe(true);
  });

  it("denied keeps the toggle off and shows guidance under that toggle only", async () => {
    useSettingsStore.getState().setPrivacy({ notificationsEnabled: true });
    requestNotificationPermission.mockResolvedValueOnce(denied);
    const user = userEvent.setup();
    renderSettings();
    await user.click(toggleSwitch(/^notification banner$/i));

    await waitFor(() =>
      expect(
        within(rowOf(/^notification banner$/i)).getByRole("status").textContent,
      ).toBe(PERMISSION_SETTINGS_MESSAGE),
    );
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(
      toggleSwitch(/^notification banner$/i).getAttribute("aria-checked"),
    ).toBe("false");
    expect(useSettingsStore.getState().privacy.notificationBannersEnabled).toBe(
      false,
    );
  });

  it("unavailable shows the build message", async () => {
    requestNotificationPermission.mockResolvedValueOnce({
      status: "unavailable",
      alertEnabled: false,
    });
    const user = userEvent.setup();
    renderSettings();
    await user.click(toggleSwitch(/^notifications$/i));
    await waitFor(() =>
      expect(
        within(rowOf(/^notifications$/i)).getByRole("status").textContent,
      ).toBe(NOTIFICATIONS_UNAVAILABLE_MESSAGE),
    );
    expect(useSettingsStore.getState().privacy.notificationsEnabled).toBe(
      false,
    );
  });

  it("a later success clears the previous message", async () => {
    requestNotificationPermission
      .mockResolvedValueOnce(denied)
      .mockResolvedValueOnce(authorized);
    const user = userEvent.setup();
    renderSettings();
    await user.click(toggleSwitch(/^notifications$/i));
    await screen.findByText(PERMISSION_SETTINGS_MESSAGE);

    await user.click(toggleSwitch(/^notifications$/i));
    await waitFor(() =>
      expect(
        toggleSwitch(/^notifications$/i).getAttribute("aria-checked"),
      ).toBe("true"),
    );
    expect(screen.queryByText(PERMISSION_SETTINGS_MESSAGE)).toBeNull();
  });

  it("the message is gone after leaving and reopening Settings", async () => {
    requestNotificationPermission.mockResolvedValueOnce(denied);
    const user = userEvent.setup();
    const view = renderSettings();
    await user.click(toggleSwitch(/^notifications$/i));
    await screen.findByText(PERMISSION_SETTINGS_MESSAGE);

    view.unmount();
    renderSettings();
    expect(screen.queryByText(PERMISSION_SETTINGS_MESSAGE)).toBeNull();
  });

  it("locks Notifications while a Wake request is pending", async () => {
    useSettingsStore.getState().setPrivacy({ notificationsEnabled: true });
    let answer: (reply: NotificationPermissionReply) => void = () => undefined;
    requestNotificationPermission.mockImplementationOnce(
      () =>
        new Promise<NotificationPermissionReply>((resolve) => {
          answer = resolve;
        }),
    );
    const user = userEvent.setup();
    renderSettings();
    await user.click(toggleSwitch(/^wake contact$/i));

    expect(
      (toggleSwitch(/^notifications$/i) as HTMLButtonElement).disabled,
    ).toBe(true);

    answer(denied);
    await waitFor(() =>
      expect(
        (toggleSwitch(/^notifications$/i) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
  });

  it("turning Notifications off clears Wake and Banner messages", async () => {
    useSettingsStore.getState().setPrivacy({ notificationsEnabled: true });
    requestNotificationPermission.mockResolvedValueOnce(denied);
    const user = userEvent.setup();
    renderSettings();
    await user.click(toggleSwitch(/^notification banner$/i));
    await screen.findByText(PERMISSION_SETTINGS_MESSAGE);

    await user.click(toggleSwitch(/^notifications$/i));

    expect(screen.queryAllByRole("status")).toHaveLength(0);
  });

  it("the message clears when the user switches tabs while Settings stays mounted", async () => {
    requestNotificationPermission.mockResolvedValueOnce(denied);
    const user = userEvent.setup();
    renderSettings();
    await user.click(toggleSwitch(/^notifications$/i));
    await screen.findByText(PERMISSION_SETTINGS_MESSAGE);

    switchTabAwayAndBack();

    expect(screen.queryByText(PERMISSION_SETTINGS_MESSAGE)).toBeNull();
  });

  it("passes an abort signal paired with a late-reply handler to the request", async () => {
    requestNotificationPermission.mockResolvedValueOnce(authorized);
    const user = userEvent.setup();
    renderSettings();
    await user.click(toggleSwitch(/^notifications$/i));
    await waitFor(() =>
      expect(requestNotificationPermission).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
          onLateReply: expect.any(Function),
        }),
      ),
    );
  });

  it("a late authorized reply after timeout turns the toggle on while mounted", async () => {
    let lateReply: (reply: NotificationPermissionReply) => void = () =>
      undefined;
    requestNotificationPermission.mockImplementationOnce(
      async (
        _req: unknown,
        options: { onLateReply: (r: NotificationPermissionReply) => void },
      ) => {
        lateReply = options.onLateReply;
        return { status: "unavailable", alertEnabled: false, timedOut: true };
      },
    );
    const user = userEvent.setup();
    renderSettings();
    await user.click(toggleSwitch(/^notifications$/i));
    await waitFor(() =>
      expect(
        (toggleSwitch(/^notifications$/i) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(screen.queryAllByRole("status")).toHaveLength(0);

    lateReply(authorized);
    await waitFor(() =>
      expect(useSettingsStore.getState().privacy.notificationsEnabled).toBe(
        true,
      ),
    );
  });
});

describe("SettingsScreen notification reconciliation on open", () => {
  beforeEach(() => {
    getStorage().removeItem("gnh.settings");
    useSettingsStore.getState().reset();
    mockIsMobileHost = true;
    requestNotificationPermission.mockReset();
    getNotificationPermissionStatus.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  function privacy() {
    return useSettingsStore.getState().privacy;
  }

  function flushReply(): Promise<void> {
    return act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  }

  it("notDetermined turns stored-on Notifications off without prompting", async () => {
    useSettingsStore.getState().setPrivacy({ notificationsEnabled: true });
    getNotificationPermissionStatus.mockResolvedValueOnce({
      status: "notDetermined",
      alertEnabled: false,
    });
    renderSettings();
    await waitFor(() => expect(privacy().notificationsEnabled).toBe(false));
    expect(getNotificationPermissionStatus).toHaveBeenCalledOnce();
    expect(getNotificationPermissionStatus).toHaveBeenCalledWith(
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(requestNotificationPermission).not.toHaveBeenCalled();
    expect(screen.queryAllByRole("status")).toHaveLength(0);
  });

  it("authorized with alerts off turns Wake and Banner off, keeps Notifications on", async () => {
    useSettingsStore.getState().setPrivacy({
      notificationsEnabled: true,
      pushWakeEnabled: true,
      notificationBannersEnabled: true,
    });
    getNotificationPermissionStatus.mockResolvedValueOnce({
      status: "authorized",
      alertEnabled: false,
    });
    renderSettings();
    await waitFor(() => expect(privacy().pushWakeEnabled).toBe(false));
    expect(privacy().notificationBannersEnabled).toBe(false);
    expect(privacy().notificationsEnabled).toBe(true);
    expect(screen.queryAllByRole("status")).toHaveLength(0);
  });

  it("authorized leaves a stored-off toggle off", async () => {
    useSettingsStore.getState().setPrivacy({ notificationsEnabled: true });
    getNotificationPermissionStatus.mockResolvedValueOnce(authorized);
    renderSettings();
    await waitFor(() =>
      expect(getNotificationPermissionStatus).toHaveBeenCalledOnce(),
    );
    await flushReply();
    expect(privacy().notificationsEnabled).toBe(true);
    expect(privacy().pushWakeEnabled).toBe(false);
    expect(privacy().notificationBannersEnabled).toBe(false);
  });

  it("unavailable changes nothing", async () => {
    useSettingsStore.getState().setPrivacy({
      notificationsEnabled: true,
      notificationBannersEnabled: true,
    });
    getNotificationPermissionStatus.mockResolvedValueOnce({
      status: "unavailable",
      alertEnabled: false,
    });
    renderSettings();
    await waitFor(() =>
      expect(getNotificationPermissionStatus).toHaveBeenCalledOnce(),
    );
    await flushReply();
    expect(privacy().notificationsEnabled).toBe(true);
    expect(privacy().notificationBannersEnabled).toBe(true);
  });

  it("reconciles again each time the user returns to Settings", async () => {
    useSettingsStore.getState().setPrivacy({ notificationsEnabled: true });
    getNotificationPermissionStatus
      .mockResolvedValueOnce(authorized)
      .mockResolvedValueOnce({ status: "denied", alertEnabled: false });
    renderSettings();
    await waitFor(() =>
      expect(getNotificationPermissionStatus).toHaveBeenCalledOnce(),
    );
    await flushReply();
    expect(privacy().notificationsEnabled).toBe(true);

    switchTabAwayAndBack();

    await waitFor(() => expect(privacy().notificationsEnabled).toBe(false));
    expect(getNotificationPermissionStatus).toHaveBeenCalledTimes(2);
  });

  it("does not query permission status off a mobile host", () => {
    mockIsMobileHost = false;
    useSettingsStore.getState().setPrivacy({ notificationsEnabled: true });
    renderSettings();
    expect(getNotificationPermissionStatus).not.toHaveBeenCalled();
    expect(privacy().notificationsEnabled).toBe(true);
  });
});
