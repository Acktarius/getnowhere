import { beforeEach, describe, expect, it, vi } from "vitest";

const rn = vi.hoisted(() => ({
  Platform: { OS: "ios" as string, Version: "17.0" as string | number },
  NativeModules: {} as Record<string, unknown>,
  PermissionsAndroid: {
    PERMISSIONS: {
      POST_NOTIFICATIONS: "android.permission.POST_NOTIFICATIONS",
    },
    request: async () => "denied",
  },
}));

vi.mock("react-native", () => rn);

type FakeNative = {
  requestPermissions: ReturnType<typeof vi.fn>;
  getPermissionStatus: ReturnType<typeof vi.fn>;
};

function installNative(
  request: { granted: boolean; status: string },
  current: { status: string; alert: boolean; badge: boolean },
): FakeNative {
  const native: FakeNative = {
    requestPermissions: vi.fn(async () => JSON.stringify(request)),
    getPermissionStatus: vi.fn(async () => JSON.stringify(current)),
  };
  rn.NativeModules.GnhNotifications = native;
  return native;
}

async function loadHandler() {
  vi.resetModules();
  return import("../../native-wrapper/src/handleNotificationsWebViewMessage");
}

function command(fields: Record<string, unknown>): string {
  return JSON.stringify({
    channel: "gnh-notifications",
    direction: "command",
    ...fields,
  });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("handleNotificationsWebViewMessage permission replies", () => {
  beforeEach(() => {
    rn.Platform.OS = "ios";
    rn.Platform.Version = "17.0";
    rn.NativeModules = {};
  });

  it("replies to requestPermissions with the native outcome and echoes requestId", async () => {
    const current = { status: "authorized", alert: true, badge: true };
    const native = installNative(
      { granted: true, status: current.status },
      current,
    );
    const reply = vi.fn();
    const { handleNotificationsWebViewMessage } = await loadHandler();

    const handled = handleNotificationsWebViewMessage(
      command({
        action: "requestPermissions",
        requestId: "req-perm-1",
        badge: true,
        alert: false,
        wantToken: false,
      }),
      reply,
    );

    expect(handled).toBe(true);
    await vi.waitFor(() => expect(reply).toHaveBeenCalledTimes(1));
    expect(native.requestPermissions).toHaveBeenCalledWith(true, false);
    expect(reply).toHaveBeenCalledWith({
      requestId: "req-perm-1",
      status: current.status,
      alertEnabled: current.alert,
    });
  });

  it("replies to getPermissionStatus without prompting", async () => {
    const current = { status: "provisional", alert: false, badge: true };
    const native = installNative({ granted: false, status: "denied" }, current);
    const reply = vi.fn();
    const { handleNotificationsWebViewMessage } = await loadHandler();

    handleNotificationsWebViewMessage(
      command({ action: "getPermissionStatus", requestId: "req-status-1" }),
      reply,
    );

    await vi.waitFor(() => expect(reply).toHaveBeenCalledTimes(1));
    expect(native.requestPermissions).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith({
      requestId: "req-status-1",
      status: current.status,
      alertEnabled: current.alert,
    });
  });

  it("replies unavailable when the native module is missing", async () => {
    const reply = vi.fn();
    const { handleNotificationsWebViewMessage } = await loadHandler();

    handleNotificationsWebViewMessage(
      command({
        action: "requestPermissions",
        requestId: "req-missing",
        badge: true,
        alert: true,
      }),
      reply,
    );

    await vi.waitFor(() => expect(reply).toHaveBeenCalledTimes(1));
    expect(reply).toHaveBeenCalledWith({
      requestId: "req-missing",
      status: "unavailable",
      alertEnabled: false,
    });
  });

  it("replies unavailable when the native call throws", async () => {
    const native = installNative(
      { granted: true, status: "authorized" },
      { status: "authorized", alert: true, badge: true },
    );
    native.requestPermissions.mockRejectedValueOnce(new Error("native boom"));
    const reply = vi.fn();
    const { handleNotificationsWebViewMessage } = await loadHandler();

    handleNotificationsWebViewMessage(
      command({
        action: "requestPermissions",
        requestId: "req-throw",
        badge: true,
        alert: true,
      }),
      reply,
    );

    await vi.waitFor(() => expect(reply).toHaveBeenCalledTimes(1));
    expect(reply).toHaveBeenCalledWith({
      requestId: "req-throw",
      status: "unavailable",
      alertEnabled: false,
    });
  });

  it("still prompts for a legacy requestPermissions without requestId but sends no reply", async () => {
    const native = installNative(
      { granted: true, status: "authorized" },
      { status: "authorized", alert: true, badge: true },
    );
    const reply = vi.fn();
    const { handleNotificationsWebViewMessage } = await loadHandler();

    const handled = handleNotificationsWebViewMessage(
      command({ action: "requestPermissions", badge: true, alert: true }),
      reply,
    );

    expect(handled).toBe(true);
    await vi.waitFor(() =>
      expect(native.requestPermissions).toHaveBeenCalledWith(true, true),
    );
    await flush();
    expect(reply).not.toHaveBeenCalled();
  });

  it("ignores messages on other channels", async () => {
    const reply = vi.fn();
    const { handleNotificationsWebViewMessage } = await loadHandler();

    const handled = handleNotificationsWebViewMessage(
      JSON.stringify({ channel: "gnh-privacy", direction: "command" }),
      reply,
    );

    expect(handled).toBe(false);
    expect(reply).not.toHaveBeenCalled();
  });
});
