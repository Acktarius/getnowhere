/// <reference path="../../src/vite-env.d.ts" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "@/state/settingsStore";
import { useToastStore } from "@/state/toastStore";

const SENSITIVE = "gnh-fixture-ccw7m-qk4n9-unique";
const REMINDER = "You copied a sensitive value.";
const CLEAR_HINT =
  "When you are done pasting, use Clear clipboard in Privacy settings.";

const writeText = vi.fn<(text: string) => Promise<void>>();
const readText = vi.fn<() => Promise<string>>();

function toastMessages(): string[] {
  return useToastStore.getState().items.map((t) => t.message);
}

function setMobile(
  partial: Partial<NonNullable<Window["gnhMobile"]>> & {
    platform?: "ios" | "android";
  },
): void {
  window.gnhMobile = {
    sendCommand: vi.fn(),
    onBridgeEvent: vi.fn(() => () => undefined),
    ...partial,
  };
}

describe("sensitiveClipboard", () => {
  beforeEach(() => {
    writeText.mockReset().mockResolvedValue(undefined);
    readText.mockReset().mockResolvedValue("");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText, readText },
    });
    delete window.gnhMobile;
    delete window.gnhDesktop;
    useSettingsStore.getState().reset();
    useToastStore.setState({ items: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.gnhMobile;
    delete window.gnhDesktop;
    useSettingsStore.getState().reset();
    useToastStore.setState({ items: [] });
    vi.restoreAllMocks();
  });

  it("writes only the raw fixture string on web", async () => {
    const { copySensitive } = await import(
      "@/lib/clipboard/sensitiveClipboard"
    );
    await copySensitive(SENSITIVE);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(SENSITIVE);
    expect(writeText.mock.calls[0]?.[0]).not.toMatch(/Payment ID|label/i);
  });

  it("shows reminder toast that never includes the fixture value", async () => {
    const { copySensitive } = await import(
      "@/lib/clipboard/sensitiveClipboard"
    );
    await copySensitive(SENSITIVE);
    const messages = toastMessages();
    expect(messages.length).toBeGreaterThan(0);
    expect(useToastStore.getState().items[0]?.variant).toBe("info");
    expect(messages.some((m) => m.includes(REMINDER))).toBe(true);
    for (const message of messages) {
      expect(message).not.toContain(SENSITIVE);
    }
  });

  it("does not show a reminder toast when the setting is off", async () => {
    useSettingsStore.getState().setPrivacy({ clearClipboardWarnings: false });
    const { copySensitive } = await import(
      "@/lib/clipboard/sensitiveClipboard"
    );
    await copySensitive(SENSITIVE);
    expect(writeText).toHaveBeenCalledWith(SENSITIVE);
    expect(toastMessages()).toEqual([]);
  });

  it("adds the Clear clipboard hint on Android", async () => {
    setMobile({
      platform: "android",
      copySensitive: vi.fn().mockResolvedValue(undefined),
    });
    const { copySensitive } = await import(
      "@/lib/clipboard/sensitiveClipboard"
    );
    await copySensitive(SENSITIVE);
    const message = toastMessages().join("\n");
    expect(message).toContain(REMINDER);
    expect(message).toContain(CLEAR_HINT);
    expect(message).not.toContain(SENSITIVE);
  });

  it("adds the Clear clipboard hint on Electron", async () => {
    window.gnhDesktop = { role: "alice" };
    const { copySensitive } = await import(
      "@/lib/clipboard/sensitiveClipboard"
    );
    await copySensitive(SENSITIVE);
    const message = toastMessages().join("\n");
    expect(message).toContain(REMINDER);
    expect(message).toContain(CLEAR_HINT);
    expect(message).not.toContain(SENSITIVE);
    expect(writeText).toHaveBeenCalledWith(SENSITIVE);
  });

  it("omits the Clear clipboard line on iOS", async () => {
    setMobile({
      platform: "ios",
      copySensitive: vi.fn().mockResolvedValue(undefined),
    });
    const { copySensitive } = await import(
      "@/lib/clipboard/sensitiveClipboard"
    );
    await copySensitive(SENSITIVE);
    const message = toastMessages().join("\n");
    expect(message).toContain(REMINDER);
    expect(message).not.toMatch(/Clear clipboard/);
    expect(message).not.toContain(SENSITIVE);
  });

  it("omits the Clear clipboard line on browser web", async () => {
    const { copySensitive } = await import(
      "@/lib/clipboard/sensitiveClipboard"
    );
    await copySensitive(SENSITIVE);
    const message = toastMessages().join("\n");
    expect(message).toContain(REMINDER);
    expect(message).not.toMatch(/Clear clipboard/);
    expect(window.gnhMobile).toBeUndefined();
    expect(window.gnhDesktop).toBeUndefined();
  });

  it("falls back to writeText on mobile when native copy is missing", async () => {
    window.gnhMobile = { platform: "android" } as Window["gnhMobile"];
    const { copySensitive } = await import(
      "@/lib/clipboard/sensitiveClipboard"
    );
    await copySensitive(SENSITIVE);
    expect(writeText).toHaveBeenCalledWith(SENSITIVE);
    for (const message of toastMessages()) {
      expect(message).not.toContain(SENSITIVE);
    }
  });

  it("falls back to writeText when native copy rejects", async () => {
    setMobile({
      platform: "android",
      copySensitive: vi.fn().mockRejectedValue(new Error("unsupported")),
    });
    const { copySensitive } = await import(
      "@/lib/clipboard/sensitiveClipboard"
    );
    await copySensitive(SENSITIVE);
    expect(writeText).toHaveBeenCalledWith(SENSITIVE);
    for (const message of toastMessages()) {
      expect(message).not.toContain(SENSITIVE);
    }
  });

  it("delegates copy to gnhMobile and does not call writeText", async () => {
    const nativeCopy = vi.fn().mockResolvedValue(undefined);
    setMobile({ platform: "ios", copySensitive: nativeCopy });
    const { copySensitive } = await import(
      "@/lib/clipboard/sensitiveClipboard"
    );
    await copySensitive(SENSITIVE);
    expect(nativeCopy).toHaveBeenCalledTimes(1);
    expect(nativeCopy).toHaveBeenCalledWith(SENSITIVE);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("toasts a generic result after Clear clipboard and never reads", async () => {
    const { clearClipboard } = await import(
      "@/lib/clipboard/sensitiveClipboard"
    );
    await clearClipboard();
    expect(writeText).toHaveBeenCalledWith("");
    expect(toastMessages()).toEqual(["Clipboard cleared."]);
    expect(readText).not.toHaveBeenCalled();
  });

  it("falls back to writeText empty when mobile native clear is missing", async () => {
    window.gnhMobile = { platform: "android" } as Window["gnhMobile"];
    const { clearClipboard } = await import(
      "@/lib/clipboard/sensitiveClipboard"
    );
    await clearClipboard();
    expect(writeText).toHaveBeenCalledWith("");
    expect(toastMessages()).toEqual(["Clipboard cleared."]);
    expect(readText).not.toHaveBeenCalled();
  });

  it("clears via writeText empty string and never reads the clipboard", async () => {
    const { copySensitive, clearClipboard } = await import(
      "@/lib/clipboard/sensitiveClipboard"
    );
    await copySensitive(SENSITIVE);
    writeText.mockClear();
    await clearClipboard();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("");
    expect(writeText).not.toHaveBeenCalledWith(SENSITIVE);
    expect(readText).not.toHaveBeenCalled();
  });

  it("delegates clear to gnhMobile and does not call writeText", async () => {
    const nativeClear = vi.fn().mockResolvedValue(undefined);
    setMobile({ platform: "android", clearClipboard: nativeClear });
    const { clearClipboard } = await import(
      "@/lib/clipboard/sensitiveClipboard"
    );
    await clearClipboard();
    expect(nativeClear).toHaveBeenCalledTimes(1);
    expect(writeText).not.toHaveBeenCalled();
    expect(readText).not.toHaveBeenCalled();
  });

  it("omits the identifier from thrown and shown errors on failed copy", async () => {
    writeText.mockRejectedValueOnce(new Error(`denied ${SENSITIVE}`));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { copySensitive } = await import(
      "@/lib/clipboard/sensitiveClipboard"
    );
    const rejected = await copySensitive(SENSITIVE).then(
      () => undefined,
      (err: unknown) => err,
    );
    expect(rejected).toBeDefined();
    const shown = [
      String(rejected),
      rejected instanceof Error ? rejected.message : "",
      ...toastMessages(),
      ...errorSpy.mock.calls.map((c) => c.map(String).join(" ")),
    ];
    for (const text of shown) {
      expect(text).not.toContain(SENSITIVE);
    }
    expect(toastMessages().some((m) => m.includes(REMINDER))).toBe(false);
    expect(toastMessages()).toContain("Copy failed");
  });

  it("does not read the clipboard after a timer or focus event", async () => {
    vi.useFakeTimers();
    const { copySensitive } = await import(
      "@/lib/clipboard/sensitiveClipboard"
    );
    await copySensitive(SENSITIVE);
    writeText.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(readText).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
