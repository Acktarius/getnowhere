import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationPermissionReply } from "@/services/notifications/nativeNotificationTypes";
import {
  NOTIFICATIONS_UNAVAILABLE_MESSAGE,
  PERMISSION_SETTINGS_MESSAGE,
  WAKE_REGISTRATION_FAILED_MESSAGE,
} from "@/services/notifications/notificationToggleFlow";

const setPrivacy = vi.fn();
const subscribeAll = vi.fn();
const requestNotificationPermission = vi.fn();
const registerPokeHandle = vi.fn();

let mockIsMobileHost = true;
let mockIsMobileAndroid = false;

vi.mock("@/state/settingsStore", () => ({
  useSettingsStore: {
    getState: () => ({ setPrivacy }),
  },
}));

vi.mock("@/lib/mobile/gnhMobileBridgeTypes", () => ({
  isMobileHost: () => mockIsMobileHost,
  isMobileAndroid: () => mockIsMobileAndroid,
}));

vi.mock("@/lib/mobile/nativeNotificationsBridge", () => ({
  requestNotificationPermission: (...args: unknown[]) =>
    requestNotificationPermission(...args),
}));

vi.mock("@/services/poke/pokeGatewayClient", () => ({
  registerPokeHandle: (...args: unknown[]) => registerPokeHandle(...args),
}));

vi.mock("@/lib/mobile/ntfyWakeBridge", () => ({
  subscribeAll: (...args: unknown[]) => subscribeAll(...args),
}));

const TOKEN = "apns-fixture-token";

function replyWith(reply: NotificationPermissionReply): void {
  requestNotificationPermission.mockResolvedValueOnce(reply);
}

describe("applyPushWakeEnabled", () => {
  beforeEach(() => {
    setPrivacy.mockClear();
    subscribeAll.mockClear();
    requestNotificationPermission.mockReset();
    registerPokeHandle.mockReset();
    registerPokeHandle.mockResolvedValue("handle-fixture");
    mockIsMobileHost = true;
    mockIsMobileAndroid = false;
    vi.resetModules();
  });

  async function load() {
    return (await import("@/services/poke/applyPushWakeSetting"))
      .applyPushWakeEnabled;
  }

  it("on=false: persists opt-out without any permission or wake calls", async () => {
    const applyPushWakeEnabled = await load();
    await expect(applyPushWakeEnabled(false)).resolves.toEqual({ on: false });
    expect(setPrivacy).toHaveBeenCalledWith({ pushWakeEnabled: false });
    expect(requestNotificationPermission).not.toHaveBeenCalled();
    expect(registerPokeHandle).not.toHaveBeenCalled();
    expect(subscribeAll).not.toHaveBeenCalled();
  });

  it("on=true + Android granted: subscribes, persists, no gateway", async () => {
    mockIsMobileAndroid = true;
    replyWith({ status: "authorized", alertEnabled: true });
    const applyPushWakeEnabled = await load();
    await expect(applyPushWakeEnabled(true)).resolves.toEqual({ on: true });
    expect(requestNotificationPermission).toHaveBeenCalledWith(
      { badge: true, alert: true, wantToken: false },
      expect.anything(),
    );
    expect(subscribeAll).toHaveBeenCalledTimes(1);
    expect(registerPokeHandle).not.toHaveBeenCalled();
    expect(setPrivacy).toHaveBeenCalledWith({ pushWakeEnabled: true });
  });

  it("on=true + iOS granted: registers the APNs token, then persists", async () => {
    replyWith({ status: "authorized", alertEnabled: true, apnsToken: TOKEN });
    const applyPushWakeEnabled = await load();
    await expect(applyPushWakeEnabled(true)).resolves.toEqual({ on: true });
    expect(requestNotificationPermission).toHaveBeenCalledWith(
      { badge: true, alert: true, wantToken: true },
      expect.anything(),
    );
    expect(registerPokeHandle).toHaveBeenCalledWith("apns", TOKEN);
    expect(subscribeAll).not.toHaveBeenCalled();
    expect(setPrivacy).toHaveBeenCalledWith({ pushWakeEnabled: true });
  });

  it("on=true + iOS gateway failure: stays off with the registration message", async () => {
    replyWith({ status: "authorized", alertEnabled: true, apnsToken: TOKEN });
    registerPokeHandle.mockRejectedValueOnce(new Error("gateway down"));
    const applyPushWakeEnabled = await load();
    await expect(applyPushWakeEnabled(true)).resolves.toEqual({
      on: false,
      message: WAKE_REGISTRATION_FAILED_MESSAGE,
    });
    expect(setPrivacy).not.toHaveBeenCalled();
  });

  it("on=true + denied: stays off with guidance, nothing persisted", async () => {
    replyWith({ status: "denied", alertEnabled: false });
    const applyPushWakeEnabled = await load();
    await expect(applyPushWakeEnabled(true)).resolves.toEqual({
      on: false,
      message: PERMISSION_SETTINGS_MESSAGE,
    });
    expect(setPrivacy).not.toHaveBeenCalled();
    expect(subscribeAll).not.toHaveBeenCalled();
  });

  it("on=true + unavailable (non-mobile host): stays off with the build message", async () => {
    mockIsMobileHost = false;
    replyWith({ status: "unavailable", alertEnabled: false });
    const applyPushWakeEnabled = await load();
    await expect(applyPushWakeEnabled(true)).resolves.toEqual({
      on: false,
      message: NOTIFICATIONS_UNAVAILABLE_MESSAGE,
    });
    expect(setPrivacy).not.toHaveBeenCalled();
    expect(registerPokeHandle).not.toHaveBeenCalled();
    expect(subscribeAll).not.toHaveBeenCalled();
  });

  it("persists and forwards a late successful reply", async () => {
    let lateReply: ((reply: NotificationPermissionReply) => void) | undefined;
    requestNotificationPermission.mockImplementationOnce(
      async (
        _req: unknown,
        options: { onLateReply?: (r: NotificationPermissionReply) => void },
      ) => {
        lateReply = options.onLateReply;
        return { status: "unavailable", alertEnabled: false, timedOut: true };
      },
    );
    const onLateResult = vi.fn();
    const applyPushWakeEnabled = await load();
    await expect(applyPushWakeEnabled(true, { onLateResult })).resolves.toEqual(
      { on: false },
    );
    expect(setPrivacy).not.toHaveBeenCalled();
    lateReply?.({ status: "authorized", alertEnabled: true, apnsToken: TOKEN });
    await vi.waitFor(() =>
      expect(onLateResult).toHaveBeenCalledWith({ on: true }),
    );
    expect(setPrivacy).toHaveBeenCalledWith({ pushWakeEnabled: true });
  });
});
