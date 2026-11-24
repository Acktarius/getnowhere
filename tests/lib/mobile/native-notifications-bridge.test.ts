/// <reference path="../../../src/vite-env.d.ts" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getNotificationPermissionStatus,
  NOTIFICATION_REPLY_TIMEOUT_MS,
  requestNotificationPermission,
} from "@/lib/mobile/nativeNotificationsBridge";

type ReplyHandler = (reply: Record<string, unknown>) => void;

let handlers: ReplyHandler[];
let postMessage: ReturnType<typeof vi.fn>;

function deliver(reply: Record<string, unknown>): void {
  for (const handler of [...handlers]) handler(reply);
}

function lastCommand(): Record<string, unknown> {
  const raw = postMessage.mock.calls.at(-1)?.[0] as string;
  return JSON.parse(raw) as Record<string, unknown>;
}

function installMobileHost(): void {
  window.gnhMobile = {
    sendCommand: vi.fn(),
    onBridgeEvent: () => () => undefined,
    _onNotificationsReply(handler: ReplyHandler) {
      handlers.push(handler);
      return () => {
        handlers = handlers.filter((h) => h !== handler);
      };
    },
  } as GnhMobileBridge;
}

describe("nativeNotificationsBridge permission replies", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    handlers = [];
    postMessage = vi.fn();
    Object.defineProperty(window, "ReactNativeWebView", {
      value: { postMessage },
      configurable: true,
    });
    installMobileHost();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.gnhMobile;
  });

  it("resolves unavailable immediately off a mobile host", async () => {
    delete window.gnhMobile;
    await expect(
      requestNotificationPermission({
        badge: true,
        alert: true,
        wantToken: true,
      }),
    ).resolves.toEqual({ status: "unavailable", alertEnabled: false });
    await expect(getNotificationPermissionStatus()).resolves.toEqual({
      status: "unavailable",
      alertEnabled: false,
    });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("resolves unavailable when the shell lacks _onNotificationsReply", async () => {
    window.gnhMobile = {
      sendCommand: vi.fn(),
      onBridgeEvent: () => () => undefined,
    } as GnhMobileBridge;
    await expect(getNotificationPermissionStatus()).resolves.toEqual({
      status: "unavailable",
      alertEnabled: false,
    });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("resolves unavailable immediately when ReactNativeWebView.postMessage is missing", async () => {
    Object.defineProperty(window, "ReactNativeWebView", {
      value: undefined,
      configurable: true,
    });
    await expect(
      requestNotificationPermission({
        badge: true,
        alert: true,
        wantToken: true,
      }),
    ).resolves.toEqual({ status: "unavailable", alertEnabled: false });
    expect(handlers).toHaveLength(0);
  });

  it("posts a requestPermissions command with a fresh requestId", () => {
    const options = { badge: false, alert: true, wantToken: true };
    void requestNotificationPermission(options);
    const first = lastCommand();
    expect(first).toEqual({
      channel: "gnh-notifications",
      direction: "command",
      action: "requestPermissions",
      requestId: first.requestId,
      ...options,
    });
    expect(typeof first.requestId).toBe("string");

    void requestNotificationPermission(options);
    expect(lastCommand().requestId).not.toBe(first.requestId);
  });

  it("posts a getPermissionStatus command", () => {
    void getNotificationPermissionStatus();
    const cmd = lastCommand();
    expect(cmd).toEqual({
      channel: "gnh-notifications",
      direction: "command",
      action: "getPermissionStatus",
      requestId: cmd.requestId,
    });
    expect(typeof cmd.requestId).toBe("string");
  });

  it("resolves only with the reply whose requestId matches", async () => {
    const onSettled = vi.fn();
    void requestNotificationPermission({
      badge: true,
      alert: true,
      wantToken: true,
    }).then(onSettled);
    const requestId = lastCommand().requestId as string;

    deliver({
      requestId: `${requestId}-other`,
      status: "denied",
      alertEnabled: false,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(onSettled).not.toHaveBeenCalled();

    const match = {
      requestId,
      status: "authorized",
      alertEnabled: true,
      apnsToken: "apns-fixture-token",
    };
    deliver(match);
    await vi.advanceTimersByTimeAsync(0);
    expect(onSettled).toHaveBeenCalledWith(match);
    expect(handlers).toHaveLength(0);
  });

  it("sanitizes malformed replies", async () => {
    const pending = getNotificationPermissionStatus();
    const requestId = lastCommand().requestId as string;
    deliver({
      requestId,
      status: "granted-ish",
      alertEnabled: "yes",
      apnsToken: 42,
    });
    await expect(pending).resolves.toEqual({
      requestId,
      status: "unavailable",
      alertEnabled: false,
    });
  });

  it("stays pending until the timeout, then resolves unavailable + timedOut", async () => {
    const onSettled = vi.fn();
    void requestNotificationPermission({
      badge: true,
      alert: true,
      wantToken: false,
    }).then(onSettled);

    await vi.advanceTimersByTimeAsync(NOTIFICATION_REPLY_TIMEOUT_MS - 1);
    expect(onSettled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onSettled).toHaveBeenCalledWith({
      status: "unavailable",
      alertEnabled: false,
      timedOut: true,
    });
  });

  it("delivers a late matching reply to onLateReply after timeout", async () => {
    const onLateReply = vi.fn();
    const pending = requestNotificationPermission(
      { badge: true, alert: true, wantToken: true },
      { onLateReply },
    );
    const requestId = lastCommand().requestId as string;
    await vi.advanceTimersByTimeAsync(NOTIFICATION_REPLY_TIMEOUT_MS);
    await expect(pending).resolves.toMatchObject({ timedOut: true });

    deliver({
      requestId: `${requestId}-other`,
      status: "authorized",
      alertEnabled: true,
    });
    expect(onLateReply).not.toHaveBeenCalled();

    const late = { requestId, status: "authorized", alertEnabled: true };
    deliver(late);
    expect(onLateReply).toHaveBeenCalledOnce();
    expect(onLateReply).toHaveBeenCalledWith(late);
    expect(handlers).toHaveLength(0);
  });

  it("drops a late reply once the caller aborts", async () => {
    const onLateReply = vi.fn();
    const controller = new AbortController();
    const pending = requestNotificationPermission(
      { badge: true, alert: true, wantToken: true },
      { onLateReply, signal: controller.signal },
    );
    const requestId = lastCommand().requestId as string;
    await vi.advanceTimersByTimeAsync(NOTIFICATION_REPLY_TIMEOUT_MS);
    await pending;

    controller.abort();
    expect(handlers).toHaveLength(0);
    deliver({ requestId, status: "authorized", alertEnabled: true });
    expect(onLateReply).not.toHaveBeenCalled();
  });

  it("aborting before a reply resolves unavailable and detaches", async () => {
    const controller = new AbortController();
    const pending = getNotificationPermissionStatus({
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).resolves.toEqual({
      status: "unavailable",
      alertEnabled: false,
    });
    expect(handlers).toHaveLength(0);
  });
});
