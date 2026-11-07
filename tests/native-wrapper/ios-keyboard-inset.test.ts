import { describe, expect, it } from "vitest";
import {
  iosKeyboardInsetScript,
  iosKeyboardOverlapPx,
  isIosKeyboardDismissMessage,
} from "../../native-wrapper/src/iosKeyboardInset";

describe("iosKeyboardOverlapPx", () => {
  it("returns the keyboard overlap above the bottom of the window", () => {
    expect(iosKeyboardOverlapPx(800, { height: 300, screenY: 500 })).toBe(300);
  });

  it("returns 0 when the keyboard sits at or below the window", () => {
    expect(iosKeyboardOverlapPx(800, { height: 300, screenY: 800 })).toBe(0);
    expect(iosKeyboardOverlapPx(800, { height: 300, screenY: 900 })).toBe(0);
    expect(iosKeyboardOverlapPx(800, { height: 0, screenY: 0 })).toBe(0);
  });

  it("ignores a non-positive window height", () => {
    expect(iosKeyboardOverlapPx(0, { height: 300, screenY: 0 })).toBe(0);
  });
});

describe("isIosKeyboardDismissMessage", () => {
  it("accepts only the keyboard dismiss command", () => {
    expect(
      isIosKeyboardDismissMessage(
        JSON.stringify({ channel: "gnh-keyboard", action: "dismiss" }),
      ),
    ).toBe(true);
    expect(
      isIosKeyboardDismissMessage(
        JSON.stringify({ channel: "gnh-keyboard", action: "show" }),
      ),
    ).toBe(false);
    expect(isIosKeyboardDismissMessage("not-json")).toBe(false);
  });
});

describe("iosKeyboardInsetScript", () => {
  it("publishes a finite pixel height and completes for WKWebView", () => {
    const script = iosKeyboardInsetScript(336.4);
    expect(script).toContain("window.__gnhIosKeyboardHeight=336");
    expect(script).toContain(
      'new CustomEvent("gnh-ios-keyboard",{detail:336})',
    );
    expect(script.endsWith("true;")).toBe(true);
  });
});
