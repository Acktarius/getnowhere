/// <reference path="../../src/vite-env.d.ts" />
import { describe, expect, it, vi } from "vitest";
import {
  buildMobileBridgeInjection,
  buildPokeTokenDispatchScript,
} from "../../native-wrapper/src/injectMobileBridge";

describe("buildMobileBridgeInjection", () => {
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
});
