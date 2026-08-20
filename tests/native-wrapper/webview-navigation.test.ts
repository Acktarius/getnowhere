import { describe, expect, it } from "vitest";
import {
  ANDROID_UI_ASSET_PREFIX,
  isAllowedWebViewNavigationUrl,
  WEBVIEW_ORIGIN_WHITELIST,
} from "../../native-wrapper/src/webviewNavigation";

describe("isAllowedWebViewNavigationUrl", () => {
  it("allows packaged UI index and relative asset paths", () => {
    expect(
      isAllowedWebViewNavigationUrl(`${ANDROID_UI_ASSET_PREFIX}index.html`),
    ).toBe(true);
    expect(
      isAllowedWebViewNavigationUrl(
        `${ANDROID_UI_ASSET_PREFIX}assets/index-abc123.js`,
      ),
    ).toBe(true);
    expect(
      isAllowedWebViewNavigationUrl(
        `${ANDROID_UI_ASSET_PREFIX}index.html#/rooms/abc`,
      ),
    ).toBe(true);
  });

  it("blocks external and non-UI file schemes", () => {
    expect(isAllowedWebViewNavigationUrl("https://evil.example/")).toBe(false);
    expect(isAllowedWebViewNavigationUrl("http://evil.example/")).toBe(false);
    expect(isAllowedWebViewNavigationUrl("intent://pay#Intent;end")).toBe(
      false,
    );
    expect(
      isAllowedWebViewNavigationUrl("file:///android_asset/other/index.html"),
    ).toBe(false);
    expect(isAllowedWebViewNavigationUrl("javascript:alert(1)")).toBe(false);
  });

  it("allows about:blank for WebView internals", () => {
    expect(isAllowedWebViewNavigationUrl("about:blank")).toBe(true);
  });
});

describe("WEBVIEW_ORIGIN_WHITELIST", () => {
  it("scopes origins to the packaged UI prefix", () => {
    expect(WEBVIEW_ORIGIN_WHITELIST).toEqual(["file:///android_asset/ui/*"]);
  });
});
