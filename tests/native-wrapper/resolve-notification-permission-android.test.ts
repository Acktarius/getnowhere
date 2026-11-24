import { describe, expect, it, vi } from "vitest";
import {
  type NotificationPermissionDeps,
  resolveNotificationPermission,
} from "../../native-wrapper/src/resolveNotificationPermission";

const POST_NOTIFICATIONS_API_LEVEL = 33;

function androidDeps(options: {
  apiLevel: number;
  postNotifications: string;
  enabled: boolean;
}) {
  const current = {
    status: options.enabled ? "authorized" : "denied",
    alert: options.enabled,
    badge: options.enabled,
  };
  const calls: string[] = [];
  const native = {
    requestPermissions: vi.fn(async () => {
      calls.push("kotlin.requestPermissions");
      return JSON.stringify({ granted: false, status: "requested" });
    }),
    getPermissionStatus: vi.fn(async () => JSON.stringify(current)),
  };
  const requestAndroidPostNotifications = vi.fn(async () => {
    calls.push("PermissionsAndroid.request");
    return options.postNotifications;
  });
  const getDevicePushToken = vi.fn(async () => "never-used-on-android");
  const deps: NotificationPermissionDeps = {
    platformOS: "android",
    androidApiLevel: options.apiLevel,
    native,
    requestAndroidPostNotifications,
    getDevicePushToken,
  };
  return {
    deps,
    native,
    requestAndroidPostNotifications,
    getDevicePushToken,
    current,
    calls,
  };
}

const request = { badge: true, alert: true, wantToken: true };

describe("resolveNotificationPermission (Android)", () => {
  it("maps a granted POST_NOTIFICATIONS answer to authorized with Kotlin alertEnabled", async () => {
    const { deps, current, calls, getDevicePushToken } = androidDeps({
      apiLevel: POST_NOTIFICATIONS_API_LEVEL,
      postNotifications: "granted",
      enabled: true,
    });

    const result = await resolveNotificationPermission(deps, request);

    expect(result).toEqual({
      status: "authorized",
      alertEnabled: current.alert,
    });
    expect(calls).toEqual([
      "PermissionsAndroid.request",
      "kotlin.requestPermissions",
    ]);
    expect(getDevicePushToken).not.toHaveBeenCalled();
  });

  it("waits for the POST_NOTIFICATIONS answer before resolving or touching Kotlin", async () => {
    const { deps, native, requestAndroidPostNotifications } = androidDeps({
      apiLevel: POST_NOTIFICATIONS_API_LEVEL,
      postNotifications: "granted",
      enabled: true,
    });
    let answer: (value: string) => void = () => {};
    requestAndroidPostNotifications.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          answer = resolve;
        }),
    );
    let settled = false;

    const pending = resolveNotificationPermission(deps, request).then((r) => {
      settled = true;
      return r;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(requestAndroidPostNotifications).toHaveBeenCalledTimes(1);
    expect(native.requestPermissions).not.toHaveBeenCalled();
    expect(settled).toBe(false);

    answer("granted");
    expect((await pending).status).toBe("authorized");
  });

  it.each(["denied", "never_ask_again"])(
    "maps %s to denied without a second prompt",
    async (answer) => {
      const { deps, native, current } = androidDeps({
        apiLevel: POST_NOTIFICATIONS_API_LEVEL,
        postNotifications: answer,
        enabled: false,
      });

      const result = await resolveNotificationPermission(deps, request);

      expect(result).toEqual({ status: "denied", alertEnabled: current.alert });
      expect(native.requestPermissions).not.toHaveBeenCalled();
    },
  );

  it("treats API < 33 as authorized after Kotlin ensures the channel", async () => {
    const { deps, native, requestAndroidPostNotifications, current } =
      androidDeps({
        apiLevel: POST_NOTIFICATIONS_API_LEVEL - 1,
        postNotifications: "denied",
        enabled: true,
      });

    const result = await resolveNotificationPermission(deps, request);

    expect(result).toEqual({
      status: "authorized",
      alertEnabled: current.alert,
    });
    expect(native.requestPermissions).toHaveBeenCalledWith(true, true);
    expect(requestAndroidPostNotifications).not.toHaveBeenCalled();
  });

  it("reports alertEnabled false when Kotlin says notifications are off", async () => {
    const { deps, current } = androidDeps({
      apiLevel: POST_NOTIFICATIONS_API_LEVEL - 1,
      postNotifications: "granted",
      enabled: false,
    });

    const result = await resolveNotificationPermission(deps, request);

    expect(result.alertEnabled).toBe(current.alert);
  });

  it("stays authorized when Kotlin channel setup fails after the grant", async () => {
    const { deps, native, current } = androidDeps({
      apiLevel: POST_NOTIFICATIONS_API_LEVEL,
      postNotifications: "granted",
      enabled: true,
    });
    native.requestPermissions.mockRejectedValueOnce(new Error("no channel"));

    const result = await resolveNotificationPermission(deps, request);

    expect(result).toEqual({
      status: "authorized",
      alertEnabled: current.alert,
    });
  });

  it("returns unavailable when the POST_NOTIFICATIONS request throws", async () => {
    const { deps, requestAndroidPostNotifications } = androidDeps({
      apiLevel: POST_NOTIFICATIONS_API_LEVEL,
      postNotifications: "granted",
      enabled: true,
    });
    requestAndroidPostNotifications.mockRejectedValueOnce(
      new Error("no activity"),
    );

    const result = await resolveNotificationPermission(deps, request);

    expect(result).toEqual({ status: "unavailable", alertEnabled: false });
  });
});
