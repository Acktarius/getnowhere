import { describe, expect, it, vi } from "vitest";
import { handlePrivacyWebViewMessage } from "../../native-wrapper/src/handlePrivacyWebViewMessage";

describe("handlePrivacyWebViewMessage", () => {
  it("applies setBlurInAppSwitcher enabled", () => {
    const onBlur = vi.fn();
    const handled = handlePrivacyWebViewMessage(
      JSON.stringify({
        channel: "gnh-privacy",
        direction: "event",
        type: "setBlurInAppSwitcher",
        enabled: true,
      }),
      onBlur,
    );
    expect(handled).toBe(true);
    expect(onBlur).toHaveBeenCalledWith(true);
  });

  it("applies setBlurInAppSwitcher disabled", () => {
    const onBlur = vi.fn();
    const handled = handlePrivacyWebViewMessage(
      JSON.stringify({
        channel: "gnh-privacy",
        direction: "event",
        type: "setBlurInAppSwitcher",
        enabled: false,
      }),
      onBlur,
    );
    expect(handled).toBe(true);
    expect(onBlur).toHaveBeenCalledWith(false);
  });

  it("ignores unrelated channels", () => {
    const onBlur = vi.fn();
    const handled = handlePrivacyWebViewMessage(
      JSON.stringify({
        channel: "gnh-lifecycle",
        direction: "event",
        type: "ui-ready",
      }),
      onBlur,
    );
    expect(handled).toBe(false);
    expect(onBlur).not.toHaveBeenCalled();
  });
});
