/// <reference path="../../src/vite-env.d.ts" />
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMobileBridgeInjection,
  buildNotificationsResolveScript,
  buildPokeTokenDispatchScript,
} from "../../native-wrapper/src/injectMobileBridge";

describe("buildMobileBridgeInjection", () => {
  afterEach(() => {
    delete window.gnhMobile;
  });

  it("does not expose bridgeToken on window.gnhMobile", () => {
    const script = buildMobileBridgeInjection("super-secret-token");
    expect(script).not.toMatch(/bridgeToken\s*:/);

    const postMessage = vi.fn();
    Object.defineProperty(window, "ReactNativeWebView", {
      value: { postMessage },
      configurable: true,
    });

    // WebView runs injectedJavaScript as a string; Function is the jsdom equivalent.
    new Function(script)();

    expect(window.gnhMobile).toBeDefined();
    const bridge = window.gnhMobile as GnhMobileBridge;
    expect(bridge.sendCommand).toBeTypeOf("function");
    expect(bridge.onBridgeEvent).toBeTypeOf("function");
    expect(bridge.saveTextFile).toBeTypeOf("function");
    expect(bridge._onSaveTextFile).toBeTypeOf("function");
    expect("bridgeToken" in bridge).toBe(false);

    bridge.sendCommand({ type: "ping" });
    expect(postMessage).toHaveBeenCalledOnce();
    const payload = JSON.parse(postMessage.mock.calls[0][0] as string);
    expect(payload.token).toBe("super-secret-token");
    expect(payload.type).toBe("ping");

    bridge.saveTextFile?.({
      filename: "wallet.json",
      content: "{}",
      requestId: "req-1",
    });
    expect(postMessage).toHaveBeenCalledTimes(2);
    const savePayload = JSON.parse(postMessage.mock.calls[1][0] as string);
    expect(savePayload.channel).toBe("gnh-file");
    expect(savePayload.filename).toBe("wallet.json");
    expect(savePayload.requestId).toBe("req-1");
  });

  it("exposes biometric and securePrefs security channels", () => {
    const script = buildMobileBridgeInjection("token");
    const postMessage = vi.fn();
    Object.defineProperty(window, "ReactNativeWebView", {
      value: { postMessage },
      configurable: true,
    });
    new Function(script)();
    const bridge = window.gnhMobile as GnhMobileBridge;
    expect(bridge.biometric?.isAvailable).toBeTypeOf("function");
    expect(bridge.securePrefs?.get).toBeTypeOf("function");
    expect(bridge.walletFile?.exists).toBeTypeOf("function");
    expect(bridge.walletFile?.write).toBeTypeOf("function");
    expect(bridge.onLifecycle).toBeTypeOf("function");
    expect(bridge.setBlurInAppSwitcher).toBeTypeOf("function");
    void bridge.biometric?.isAvailable("data");
    expect(postMessage).toHaveBeenCalled();
    const payload = JSON.parse(postMessage.mock.calls[0][0] as string);
    expect(payload.channel).toBe("gnh-biometric");
    expect(payload.action).toBe("isAvailable");

    postMessage.mockClear();
    bridge.setBlurInAppSwitcher?.(true);
    expect(postMessage).toHaveBeenCalledOnce();
    const privacy = JSON.parse(postMessage.mock.calls[0][0] as string);
    expect(privacy).toMatchObject({
      channel: "gnh-privacy",
      direction: "event",
      type: "setBlurInAppSwitcher",
      enabled: true,
    });

    postMessage.mockClear();
    void bridge.copySensitive?.("gnh-privacy-copy-fixture-unique");
    expect(postMessage).toHaveBeenCalledOnce();
    const copyCmd = JSON.parse(postMessage.mock.calls[0][0] as string);
    expect(copyCmd).toMatchObject({
      channel: "gnh-privacy",
      direction: "command",
      action: "copySensitive",
      value: "gnh-privacy-copy-fixture-unique",
    });
    expect(typeof copyCmd.requestId).toBe("string");

    postMessage.mockClear();
    void bridge.clearClipboard?.();
    expect(postMessage).toHaveBeenCalledOnce();
    const clearCmd = JSON.parse(postMessage.mock.calls[0][0] as string);
    expect(clearCmd).toMatchObject({
      channel: "gnh-privacy",
      direction: "command",
      action: "clearClipboard",
    });
    expect(clearCmd).not.toHaveProperty("value");
  });

  it("rejects walletFile.write when native never replies", async () => {
    vi.useFakeTimers();
    try {
      const script = buildMobileBridgeInjection("token");
      Object.defineProperty(window, "ReactNativeWebView", {
        value: { postMessage: vi.fn() },
        configurable: true,
      });
      new Function(script)();
      const bridge = window.gnhMobile as GnhMobileBridge;
      const pending = bridge.walletFile?.write("{}");
      const assertion = expect(pending).rejects.toThrow("wallet-file-timeout");
      await vi.advanceTimersByTimeAsync(15_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects non-interactive security calls when native never replies", async () => {
    vi.useFakeTimers();
    try {
      const script = buildMobileBridgeInjection("token");
      Object.defineProperty(window, "ReactNativeWebView", {
        value: { postMessage: vi.fn() },
        configurable: true,
      });
      new Function(script)();
      const bridge = window.gnhMobile as GnhMobileBridge;
      const calls = [
        bridge.securePrefs?.get("k"),
        bridge.securePrefs?.remove("k"),
        bridge.biometric?.removeCredential("cred"),
        bridge.biometric?.isAvailable("data"),
      ].map((p) => expect(p).rejects.toThrow("bridge-timeout"));
      await vi.advanceTimersByTimeAsync(10_000);
      await Promise.all(calls);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not time out interactive biometric prompts", async () => {
    vi.useFakeTimers();
    try {
      const script = buildMobileBridgeInjection("token");
      Object.defineProperty(window, "ReactNativeWebView", {
        value: { postMessage: vi.fn() },
        configurable: true,
      });
      new Function(script)();
      const bridge = window.gnhMobile as GnhMobileBridge;
      const onSettled = vi.fn();
      void bridge.biometric?.unlockAppAccess().then(onSettled, onSettled);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(onSettled).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("exposes onPokeToken / _dispatchPokeToken and dispatches correctly", () => {
    const script = buildMobileBridgeInjection("token");
    Object.defineProperty(window, "ReactNativeWebView", {
      value: { postMessage: vi.fn() },
      configurable: true,
    });
    new Function(script)();
    const bridge = window.gnhMobile as GnhMobileBridge;

    expect(bridge.onPokeToken).toBeTypeOf("function");
    expect(bridge._dispatchPokeToken).toBeTypeOf("function");

    const handler = vi.fn();
    const unsub = bridge.onPokeToken!(handler);

    bridge._dispatchPokeToken!("apns", "raw-device-token");
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith("apns", "raw-device-token");

    // Unsubscribe stops delivery.
    unsub();
    bridge._dispatchPokeToken!("apns", "new-token");
    expect(handler).toHaveBeenCalledOnce(); // still just once
  });

  it("bakes a pending wallet restore into gnhMobile before Vite boots", () => {
    const script = buildMobileBridgeInjection("token", "ios", "restore-pw");
    Object.defineProperty(window, "ReactNativeWebView", {
      value: { postMessage: vi.fn() },
      configurable: true,
    });
    new Function(script)();
    const bridge = window.gnhMobile as GnhMobileBridge;
    expect(bridge._sessionRestoreReady).toBe(true);
    expect(bridge._pendingWalletRestore).toBe("restore-pw");
  });

  it("buildPokeTokenDispatchScript produces JS that calls _dispatchPokeToken", () => {
    const script = buildMobileBridgeInjection("token");
    Object.defineProperty(window, "ReactNativeWebView", {
      value: { postMessage: vi.fn() },
      configurable: true,
    });
    new Function(script)();
    const bridge = window.gnhMobile as GnhMobileBridge;

    const handler = vi.fn();
    bridge.onPokeToken!(handler);

    const dispatchScript = buildPokeTokenDispatchScript(
      "apns",
      "device-token-xyz",
    );
    expect(dispatchScript).toContain("_dispatchPokeToken");
    expect(dispatchScript).toContain('"apns"');
    expect(dispatchScript).toContain('"device-token-xyz"');

    // Execute the script the same way the native shell would inject it.
    new Function(dispatchScript)();
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith("apns", "device-token-xyz");
  });

  it("fans _resolveNotifications replies out to _onNotificationsReply handlers", () => {
    new Function(buildMobileBridgeInjection("token"))();
    const bridge = window.gnhMobile as GnhMobileBridge;
    const first = vi.fn();
    const second = vi.fn();
    const unsubFirst = bridge._onNotificationsReply!(first);
    bridge._onNotificationsReply!(second);

    const reply = {
      requestId: "n-1",
      status: "authorized",
      alertEnabled: true,
    };
    bridge._resolveNotifications!(reply);
    expect(first).toHaveBeenCalledWith(reply);
    expect(second).toHaveBeenCalledWith(reply);

    unsubFirst();
    const next = { requestId: "n-2", status: "denied", alertEnabled: false };
    bridge._resolveNotifications!(next);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenLastCalledWith(next);
  });

  it("keeps delivering to other handlers when one throws", () => {
    new Function(buildMobileBridgeInjection("token"))();
    const bridge = window.gnhMobile as GnhMobileBridge;
    const healthy = vi.fn();
    bridge._onNotificationsReply!(() => {
      throw new Error("boom");
    });
    bridge._onNotificationsReply!(healthy);
    const reply = { requestId: "n-3", status: "denied", alertEnabled: false };
    bridge._resolveNotifications!(reply);
    expect(healthy).toHaveBeenCalledWith(reply);
  });

  it("buildNotificationsResolveScript produces JS that calls _resolveNotifications", () => {
    new Function(buildMobileBridgeInjection("token"))();
    const bridge = window.gnhMobile as GnhMobileBridge;
    const handler = vi.fn();
    bridge._onNotificationsReply!(handler);

    const reply = {
      requestId: "n-4",
      status: "provisional",
      alertEnabled: true,
      apnsToken: "tok-</script>-'quote'",
    };
    const script = buildNotificationsResolveScript(reply);
    expect(script).toContain("_resolveNotifications");

    new Function(script)();
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(reply);
  });
});
