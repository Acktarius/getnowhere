import { describe, expect, it } from "vitest";
import {
  ANDROID_UI_ASSET_PREFIX,
  getWebViewOriginWhitelist,
  isAllowedWebViewNavigationUrl,
  isIosAppBundleUiFileUrl,
  normalizeIosFileUrl,
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

  it("allows an explicit iOS UI prefix when provided", () => {
    const iosPrefix = "file:///var/containers/Bundle/Application/App.app/ui/";
    expect(
      isAllowedWebViewNavigationUrl(`${iosPrefix}index.html`, [iosPrefix]),
    ).toBe(true);
    expect(
      isAllowedWebViewNavigationUrl(
        "file:///var/containers/Bundle/Application/App.app/other/x.html",
        [iosPrefix],
      ),
    ).toBe(false);
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

  it("allows about:blank and empty iOS probe URLs", () => {
    expect(isAllowedWebViewNavigationUrl("about:blank")).toBe(true);
    expect(isAllowedWebViewNavigationUrl("")).toBe(true);
  });

  it("allows iOS App.app/ui/ URLs even when expo prefix is missing", () => {
    expect(
      isAllowedWebViewNavigationUrl(
        "file://localhost/var/containers/Bundle/Application/UUID/GetNowHere.app/ui/index.html",
      ),
    ).toBe(true);
  });
});

describe("normalizeIosFileUrl", () => {
  it("rewrites /var/ prefix to /private/var/", () => {
    expect(
      normalizeIosFileUrl(
        "file:///var/containers/Bundle/Application/App.app/ui/index.html",
      ),
    ).toBe(
      "file:///private/var/containers/Bundle/Application/App.app/ui/index.html",
    );
  });

  it("rewrites file://localhost/var/ to file:///private/var/", () => {
    expect(
      normalizeIosFileUrl(
        "file://localhost/var/containers/Bundle/Application/App.app/ui/index.html",
      ),
    ).toBe(
      "file:///private/var/containers/Bundle/Application/App.app/ui/index.html",
    );
  });

  it("decodes percent-encoding before rewrite", () => {
    expect(
      normalizeIosFileUrl(
        "file:///var/containers/Bundle/Application/App.app/ui/index%2Ehtml",
      ),
    ).toBe(
      "file:///private/var/containers/Bundle/Application/App.app/ui/index.html",
    );
  });

  it("leaves already-resolved /private/var/ paths unchanged", () => {
    const url =
      "file:///private/var/containers/Bundle/Application/App.app/ui/index.html";
    expect(normalizeIosFileUrl(url)).toBe(url);
  });

  it("leaves Android paths unchanged", () => {
    expect(normalizeIosFileUrl("file:///android_asset/ui/index.html")).toBe(
      "file:///android_asset/ui/index.html",
    );
  });
});

describe("isIosAppBundleUiFileUrl", () => {
  it("allows …/App.app/ui/… and rejects sibling ui-evil / bundle root", () => {
    expect(
      isIosAppBundleUiFileUrl(
        "file://localhost/private/var/containers/Bundle/Application/X/GetNowHere.app/ui/index.html",
      ),
    ).toBe(true);
    expect(
      isIosAppBundleUiFileUrl(
        "file:///private/var/containers/Bundle/Application/X/GetNowHere.app/ui-evil/x.html",
      ),
    ).toBe(false);
    expect(
      isIosAppBundleUiFileUrl(
        "file:///private/var/containers/Bundle/Application/X/GetNowHere.app/Info.plist",
      ),
    ).toBe(false);
  });
});

describe("isAllowedWebViewNavigationUrl — iOS symlink normalization", () => {
  const iosPrefix = "file:///var/containers/Bundle/Application/App.app/ui/";
  const privatePref =
    "file:///private/var/containers/Bundle/Application/App.app/ui/";

  it("allows /private/var/ URL when prefix uses /var/ form (normalization bridges both sides)", () => {
    expect(
      isAllowedWebViewNavigationUrl(
        "file:///private/var/containers/Bundle/Application/App.app/ui/index.html",
        [iosPrefix],
      ),
    ).toBe(true);
  });

  it("allows /var/ URL when prefix uses /private/var/ form", () => {
    expect(
      isAllowedWebViewNavigationUrl(
        "file:///var/containers/Bundle/Application/App.app/ui/index.html",
        [privatePref],
      ),
    ).toBe(true);
  });

  it("rejects a sibling directory whose name starts with 'ui' (ui-evil bypass)", () => {
    expect(
      isAllowedWebViewNavigationUrl(
        "file:///private/var/containers/Bundle/Application/App.app/ui-evil/x.html",
        [iosPrefix],
      ),
    ).toBe(false);
  });

  it("rejects a non-ui file:// path (bundle root traversal)", () => {
    expect(
      isAllowedWebViewNavigationUrl(
        "file:///private/var/containers/Bundle/Application/App.app/secrets.db",
        [iosPrefix],
      ),
    ).toBe(false);
  });
});

describe("getWebViewOriginWhitelist", () => {
  it("scopes origins to the packaged UI prefix", () => {
    expect(getWebViewOriginWhitelist()).toEqual(["file://*"]);
    expect(
      getWebViewOriginWhitelist([
        "file:///var/containers/Bundle/Application/App.app/ui/",
      ]),
    ).toEqual([
      "file://*",
      "file:///var/containers/Bundle/Application/App.app/ui/*",
    ]);
  });
});
