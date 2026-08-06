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

    // eslint-disable-next-line no-eval -- injected script is the unit under test
    eval(script);

    expect(window.gnhMobile).toBeDefined();
    expect(window.gnhMobile?.sendCommand).toBeTypeOf("function");
    expect(window.gnhMobile?.onBridgeEvent).toBeTypeOf("function");
    expect(
      (window.gnhMobile as { bridgeToken?: string }).bridgeToken,
    ).toBeUndefined();

    window.gnhMobile?.sendCommand({ type: "ping" });
    expect(postMessage).toHaveBeenCalledOnce();
    const payload = JSON.parse(postMessage.mock.calls[0][0] as string);
    expect(payload.token).toBe("super-secret-token");
    expect(payload.type).toBe("ping");
  });
});
