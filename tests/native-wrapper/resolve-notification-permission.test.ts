import { describe, expect, it, vi } from "vitest";
import {
  type NotificationPermissionDeps,
  readNotificationPermissionStatus,
  resolveNotificationPermission,
} from "../../native-wrapper/src/resolveNotificationPermission";

const APNS_TOKEN = "apns-token-fixture-6f1c";

type IosFixture = {
  answer: string;
  current?: { status: string; alert: boolean; badge: boolean };
};

function iosDeps(fixture: IosFixture) {
  const current = fixture.current ?? {
    status: "authorized",
    alert: true,
    badge: true,
  };
  const native = {
    requestPermissions: vi.fn(async () => fixture.answer),
    getPermissionStatus: vi.fn(async () => JSON.stringify(current)),
  };
  const getDevicePushToken = vi.fn(async () => APNS_TOKEN);
  const requestAndroidPostNotifications = vi.fn(async () => "granted");
  const deps: NotificationPermissionDeps = {
    platformOS: "ios",
    androidApiLevel: 0,
    native,
    getDevicePushToken,
    requestAndroidPostNotifications,
  };
  return { deps, native, getDevicePushToken, current };
}

function answer(status: string): string {
  return JSON.stringify({
    granted: status === "authorized" || status === "provisional",
    status,
  });
}

const request = (wantToken: boolean) => ({
  badge: true,
  alert: true,
  wantToken,
});

describe("resolveNotificationPermission (iOS)", () => {
  it("does not fetch the APNs token until the permission answer resolves", async () => {
    const { deps, native, getDevicePushToken } = iosDeps({
      answer: answer("authorized"),
    });
    let release: (value: string) => void = () => {};
    native.requestPermissions.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );

    const pending = resolveNotificationPermission(deps, request(true));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(native.requestPermissions).toHaveBeenCalledWith(true, true);
    expect(getDevicePushToken).not.toHaveBeenCalled();
    expect(native.getPermissionStatus).not.toHaveBeenCalled();

    release(answer("authorized"));
    const result = await pending;

    expect(getDevicePushToken).toHaveBeenCalledTimes(1);
    expect(result.apnsToken).toBe(APNS_TOKEN);
  });

  it("returns status, alertEnabled and token when authorized with wantToken", async () => {
    const current = { status: "authorized", alert: false, badge: true };
    const { deps, getDevicePushToken } = iosDeps({
      answer: answer(current.status),
      current,
    });

    const result = await resolveNotificationPermission(deps, request(true));

    expect(getDevicePushToken).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: current.status,
      alertEnabled: current.alert,
      apnsToken: APNS_TOKEN,
    });
  });

  it("fetches the token for provisional authorization", async () => {
    const { deps, getDevicePushToken } = iosDeps({
      answer: answer("provisional"),
    });

    const result = await resolveNotificationPermission(deps, request(true));

    expect(result.status).toBe("provisional");
    expect(getDevicePushToken).toHaveBeenCalledTimes(1);
    expect(result.apnsToken).toBe(APNS_TOKEN);
  });

  it.each(["denied", "notDetermined"])(
    "never fetches the token when the answer is %s",
    async (status) => {
      const { deps, getDevicePushToken } = iosDeps({ answer: answer(status) });

      const result = await resolveNotificationPermission(deps, request(true));

      expect(result.status).toBe(status);
      expect(result.apnsToken).toBeUndefined();
      expect(getDevicePushToken).not.toHaveBeenCalled();
    },
  );

  it("never fetches the token when wantToken is false", async () => {
    const { deps, getDevicePushToken } = iosDeps({
      answer: answer("authorized"),
    });

    const result = await resolveNotificationPermission(deps, request(false));

    expect(result.status).toBe("authorized");
    expect(result.apnsToken).toBeUndefined();
    expect(getDevicePushToken).not.toHaveBeenCalled();
  });

  it("omits apnsToken when the token fetch fails", async () => {
    const current = { status: "authorized", alert: true, badge: true };
    const { deps, getDevicePushToken } = iosDeps({
      answer: answer(current.status),
      current,
    });
    getDevicePushToken.mockRejectedValueOnce(new Error("no aps-environment"));

    const result = await resolveNotificationPermission(deps, request(true));

    expect(result).toEqual({
      status: current.status,
      alertEnabled: current.alert,
    });
    expect("apnsToken" in result).toBe(false);
  });

  it.each([
    ["unknown status", answer("unknown")],
    ["unparseable JSON", "not-json{"],
  ])("maps %s to unavailable without fetching a token", async (_, raw) => {
    const { deps, getDevicePushToken } = iosDeps({ answer: raw });

    const result = await resolveNotificationPermission(deps, request(true));

    expect(result).toEqual({ status: "unavailable", alertEnabled: false });
    expect(getDevicePushToken).not.toHaveBeenCalled();
  });

  it("returns unavailable with no calls when the native module is missing", async () => {
    const { deps, getDevicePushToken } = iosDeps({
      answer: answer("authorized"),
    });
    const missing = { ...deps, native: undefined };

    const result = await resolveNotificationPermission(missing, request(true));

    expect(result).toEqual({ status: "unavailable", alertEnabled: false });
    expect(getDevicePushToken).not.toHaveBeenCalled();
    expect(deps.requestAndroidPostNotifications).not.toHaveBeenCalled();
  });

  it("reads status without prompting or fetching a token", async () => {
    const current = { status: "denied", alert: false, badge: false };
    const { deps, native, getDevicePushToken } = iosDeps({
      answer: answer("authorized"),
      current,
    });

    const result = await readNotificationPermissionStatus(deps);

    expect(result).toEqual({ status: current.status, alertEnabled: false });
    expect(native.requestPermissions).not.toHaveBeenCalled();
    expect(getDevicePushToken).not.toHaveBeenCalled();
  });
});
