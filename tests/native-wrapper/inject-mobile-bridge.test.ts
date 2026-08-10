/// <reference path="../../src/vite-env.d.ts" />
import { describe, expect, it, vi } from "vitest";
import { buildMobileBridgeInjection } from "../../native-wrapper/src/injectMobileBridge";

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
});
