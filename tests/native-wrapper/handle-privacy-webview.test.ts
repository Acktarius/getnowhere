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

  it("routes copySensitive command without echoing the value", async () => {
    const onBlur = vi.fn();
    const copySensitive = vi.fn(async () => undefined);
    const clearClipboard = vi.fn(async () => undefined);
    const secret = "gnh-privacy-copy-fixture-unique";
    let resolved: Record<string, unknown> | null = null;
    const handled = handlePrivacyWebViewMessage(
      JSON.stringify({
        channel: "gnh-privacy",
        direction: "command",
        requestId: "req-clip-1",
        action: "copySensitive",
        value: secret,
      }),
      onBlur,
      {
        copySensitive,
        clearClipboard,
        resolve: (r) => {
          resolved = r;
        },
      },
    );
    expect(handled).toBe(true);
    expect(onBlur).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(resolved).not.toBeNull());
    expect(copySensitive).toHaveBeenCalledWith(secret);
    expect(JSON.stringify(resolved)).not.toContain(secret);
    expect(resolved).toMatchObject({
      channel: "gnh-privacy",
      direction: "response",
      requestId: "req-clip-1",
      ok: true,
    });
  });

  it("routes clearClipboard command", async () => {
    const clearClipboard = vi.fn(async () => undefined);
    let resolved: Record<string, unknown> | null = null;
    const handled = handlePrivacyWebViewMessage(
      JSON.stringify({
        channel: "gnh-privacy",
        direction: "command",
        requestId: "req-clip-2",
        action: "clearClipboard",
      }),
      () => undefined,
      {
        copySensitive: vi.fn(async () => undefined),
        clearClipboard,
        resolve: (r) => {
          resolved = r;
        },
      },
    );
    expect(handled).toBe(true);
    await vi.waitFor(() => expect(resolved).not.toBeNull());
    expect(clearClipboard).toHaveBeenCalledTimes(1);
    expect(resolved).toMatchObject({
      requestId: "req-clip-2",
      ok: true,
    });
  });

  it("resolves a generic error when copySensitive throws and omits the value", async () => {
    const secret = "gnh-privacy-copy-fixture-unique";
    let resolved: Record<string, unknown> | null = null;
    handlePrivacyWebViewMessage(
      JSON.stringify({
        channel: "gnh-privacy",
        direction: "command",
        requestId: "req-clip-3",
        action: "copySensitive",
        value: secret,
      }),
      () => undefined,
      {
        copySensitive: async () => {
          throw new Error("native boom");
        },
        clearClipboard: vi.fn(async () => undefined),
        resolve: (r) => {
          resolved = r;
        },
      },
    );
    await vi.waitFor(() => expect(resolved).not.toBeNull());
    expect(JSON.stringify(resolved)).not.toContain(secret);
    expect(JSON.stringify(resolved)).not.toContain("native boom");
    expect(resolved).toMatchObject({
      requestId: "req-clip-3",
      error: "failed",
    });
  });
});
