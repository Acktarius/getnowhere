import { describe, expect, it, vi } from "vitest";
import type { NotificationPermissionReply } from "@/services/notifications/nativeNotificationTypes";
import {
  grantedFor,
  NOTIFICATIONS_UNAVAILABLE_MESSAGE,
  type NotificationToggle,
  PERMISSION_SETTINGS_MESSAGE,
  runToggleOn,
  type ToggleFlowDeps,
  WAKE_REGISTRATION_FAILED_MESSAGE,
} from "@/services/notifications/notificationToggleFlow";

const TOKEN = "apns-fixture-token";

const authorized: NotificationPermissionReply = {
  status: "authorized",
  alertEnabled: true,
};
const authorizedWithToken: NotificationPermissionReply = {
  ...authorized,
  apnsToken: TOKEN,
};
const provisional: NotificationPermissionReply = {
  status: "provisional",
  alertEnabled: false,
};
const alertOff: NotificationPermissionReply = {
  status: "authorized",
  alertEnabled: false,
};
const denied: NotificationPermissionReply = {
  status: "denied",
  alertEnabled: false,
};
const unavailable: NotificationPermissionReply = {
  status: "unavailable",
  alertEnabled: false,
};
const timedOut: NotificationPermissionReply = {
  ...unavailable,
  timedOut: true,
};

function makeDeps(
  replies: NotificationPermissionReply[],
  overrides: Partial<ToggleFlowDeps> = {},
) {
  const queue = [...replies];
  const request = vi.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error("no fixture reply left");
    return next;
  });
  const registerPokeHandle = vi.fn(async () => "handle-fixture");
  const subscribeAll = vi.fn();
  const deps: ToggleFlowDeps = {
    request,
    isAndroid: () => false,
    registerPokeHandle,
    subscribeAll,
    ...overrides,
  };
  return { deps, request, registerPokeHandle, subscribeAll };
}

describe("grantedFor", () => {
  it("accepts authorized and provisional for notifications only", () => {
    expect(grantedFor("notifications", authorized)).toBe(true);
    expect(grantedFor("notifications", provisional)).toBe(true);
    expect(grantedFor("wake", provisional)).toBe(false);
    expect(grantedFor("banner", provisional)).toBe(false);
  });

  it("requires alertEnabled for wake and banner", () => {
    expect(grantedFor("wake", alertOff)).toBe(false);
    expect(grantedFor("banner", alertOff)).toBe(false);
    expect(grantedFor("wake", authorized)).toBe(true);
    expect(grantedFor("banner", authorized)).toBe(true);
  });
});

describe("runToggleOn", () => {
  it("requests badge only for notifications and turns on when authorized", async () => {
    const { deps, request } = makeDeps([authorized]);
    await expect(runToggleOn("notifications", deps)).resolves.toEqual({
      on: true,
    });
    expect(request).toHaveBeenCalledWith(
      { badge: true, alert: false, wantToken: false },
      expect.anything(),
    );
  });

  it("requests badge + alert without token for banner", async () => {
    const { deps, request } = makeDeps([authorized]);
    await expect(runToggleOn("banner", deps)).resolves.toEqual({ on: true });
    expect(request).toHaveBeenCalledWith(
      { badge: true, alert: true, wantToken: false },
      expect.anything(),
    );
  });

  it("provisional turns notifications on but leaves wake and banner off with guidance", async () => {
    for (const toggle of ["wake", "banner"] as NotificationToggle[]) {
      const { deps, registerPokeHandle } = makeDeps([provisional]);
      await expect(runToggleOn(toggle, deps)).resolves.toEqual({
        on: false,
        message: PERMISSION_SETTINGS_MESSAGE,
      });
      expect(registerPokeHandle).not.toHaveBeenCalled();
    }
    const { deps } = makeDeps([provisional]);
    await expect(runToggleOn("notifications", deps)).resolves.toEqual({
      on: true,
    });
  });

  it("alert off keeps banner off with guidance", async () => {
    const { deps } = makeDeps([alertOff]);
    await expect(runToggleOn("banner", deps)).resolves.toEqual({
      on: false,
      message: PERMISSION_SETTINGS_MESSAGE,
    });
  });

  it("denied keeps the toggle off with guidance", async () => {
    const { deps } = makeDeps([denied]);
    await expect(runToggleOn("notifications", deps)).resolves.toEqual({
      on: false,
      message: PERMISSION_SETTINGS_MESSAGE,
    });
  });

  it("unavailable reports the build message", async () => {
    const { deps } = makeDeps([unavailable]);
    await expect(runToggleOn("notifications", deps)).resolves.toEqual({
      on: false,
      message: NOTIFICATIONS_UNAVAILABLE_MESSAGE,
    });
  });

  it("timed out stays off with no message", async () => {
    const { deps } = makeDeps([timedOut]);
    const result = await runToggleOn("wake", deps);
    expect(result).toEqual({ on: false });
    expect("message" in result).toBe(false);
  });

  it("wake on iOS asks for a token and registers it with the gateway", async () => {
    const { deps, request, registerPokeHandle, subscribeAll } = makeDeps([
      authorizedWithToken,
    ]);
    await expect(runToggleOn("wake", deps)).resolves.toEqual({ on: true });
    expect(request).toHaveBeenCalledWith(
      { badge: true, alert: true, wantToken: true },
      expect.anything(),
    );
    expect(registerPokeHandle).toHaveBeenCalledWith("apns", TOKEN);
    expect(subscribeAll).not.toHaveBeenCalled();
  });

  it("wake on iOS fails when the token is missing", async () => {
    const { deps, registerPokeHandle } = makeDeps([authorized]);
    await expect(runToggleOn("wake", deps)).resolves.toEqual({
      on: false,
      message: WAKE_REGISTRATION_FAILED_MESSAGE,
    });
    expect(registerPokeHandle).not.toHaveBeenCalled();
  });

  it("wake on iOS fails when the gateway rejects registration", async () => {
    const { deps } = makeDeps([authorizedWithToken], {
      registerPokeHandle: vi.fn(async () => {
        throw new Error("gateway down");
      }),
    });
    await expect(runToggleOn("wake", deps)).resolves.toEqual({
      on: false,
      message: WAKE_REGISTRATION_FAILED_MESSAGE,
    });
  });

  it("wake on Android subscribes without the gateway", async () => {
    const { deps, request, registerPokeHandle, subscribeAll } = makeDeps(
      [authorized],
      { isAndroid: () => true },
    );
    await expect(runToggleOn("wake", deps)).resolves.toEqual({ on: true });
    expect(request).toHaveBeenCalledWith(
      { badge: true, alert: true, wantToken: false },
      expect.anything(),
    );
    expect(subscribeAll).toHaveBeenCalledTimes(1);
    expect(registerPokeHandle).not.toHaveBeenCalled();
  });

  it("wake re-tap after provisional → authorized turns on", async () => {
    const { deps, registerPokeHandle } = makeDeps([
      provisional,
      authorizedWithToken,
    ]);
    await expect(runToggleOn("wake", deps)).resolves.toEqual({
      on: false,
      message: PERMISSION_SETTINGS_MESSAGE,
    });
    await expect(runToggleOn("wake", deps)).resolves.toEqual({ on: true });
    expect(registerPokeHandle).toHaveBeenCalledOnce();
    expect(registerPokeHandle).toHaveBeenCalledWith("apns", TOKEN);
  });

  it("passes the signal and an onLateReply to the request", async () => {
    const { deps, request } = makeDeps([authorized]);
    const controller = new AbortController();
    await runToggleOn("notifications", {
      ...deps,
      signal: controller.signal,
      onLateResult: vi.fn(),
    });
    const options = request.mock.calls[0]?.at(1) as {
      signal?: AbortSignal;
      onLateReply?: unknown;
    };
    expect(options.signal).toBe(controller.signal);
    expect(typeof options.onLateReply).toBe("function");
  });

  it("evaluates a late reply with the same rules (wake registers the late token)", async () => {
    const onLateResult = vi.fn();
    let lateReply: ((reply: NotificationPermissionReply) => void) | undefined;
    const registerPokeHandle = vi.fn(async () => "handle-fixture");
    const request = vi.fn(
      async (
        _req: unknown,
        options: { onLateReply?: (r: NotificationPermissionReply) => void },
      ) => {
        lateReply = options.onLateReply;
        return timedOut;
      },
    );
    await expect(
      runToggleOn("wake", {
        request,
        isAndroid: () => false,
        registerPokeHandle,
        subscribeAll: vi.fn(),
        onLateResult,
      }),
    ).resolves.toEqual({ on: false });
    lateReply?.(authorizedWithToken);
    await vi.waitFor(() => expect(onLateResult).toHaveBeenCalled());
    expect(registerPokeHandle).toHaveBeenCalledWith("apns", TOKEN);
    expect(onLateResult).toHaveBeenCalledWith({ on: true });
  });
});
