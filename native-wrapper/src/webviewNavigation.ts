/**
 * Packaged UI navigation allowlist for Android + iOS WebViews.
 * @see docs/architecture/mobile-p2p-runtime.md
 */

/** Packaged UI root on Android (file:// under android_asset). */
export const ANDROID_UI_ASSET_PREFIX = "file:///android_asset/ui/";

/**
 * Normalize iOS file:// forms WKWebView / expo may emit:
 * `/var`→`/private/var`, `file://localhost/…`, percent-encoding.
 * @see docs/architecture/mobile-p2p-runtime.md
 */
export function normalizeIosFileUrl(url: string): string {
  let u = url;
  try {
    u = decodeURIComponent(url);
  } catch {
    u = url;
  }
  const localhostPrivate = /^file:\/\/localhost\/private\/var\//i;
  const localhostVar = /^file:\/\/localhost\/var\//i;
  if (localhostPrivate.test(u)) {
    return `file:///private/var/${u.replace(localhostPrivate, "")}`;
  }
  if (localhostVar.test(u)) {
    return `file:///private/var/${u.replace(localhostVar, "")}`;
  }
  if (u.startsWith("file:///var/")) {
    return `file:///private/var/${u.slice("file:///var/".length)}`;
  }
  return u;
}

/**
 * Canonical iOS UI paths from expo `bundleDirectory`.
 * Source, allowlist prefix, and `allowingReadAccessToURL` must share one
 * `/private/var`…`/ui` form (SEC-2026-023 — ui/ only, not whole `.app`).
 */
export function buildIosBundledUiPaths(bundleDir: string): {
  indexUri: string;
  assetPrefix: string;
  readAccessUrl: string;
} {
  const base = bundleDir.endsWith("/") ? bundleDir : `${bundleDir}/`;
  return {
    indexUri: normalizeIosFileUrl(`${base}ui/index.html`),
    assetPrefix: normalizeIosFileUrl(`${base}ui/`),
    readAccessUrl: normalizeIosFileUrl(`${base}ui`),
  };
}

/**
 * SEC-2026-023 fallback: packaged UI under `Something.app/ui/` only.
 * Covers expo vs WKWebView path-string drift without opening the whole `.app`.
 */
export function isIosAppBundleUiFileUrl(url: string): boolean {
  const lower = normalizeIosFileUrl(url).toLowerCase();
  if (!lower.startsWith("file:")) return false;
  return /\/[^/]+\.app\/ui\//.test(lower);
}

/**
 * react-native-webview originWhitelist entries for the bundled UI.
 * Pass iOS `bundleDirectory + "ui/"` (with trailing slash) when available.
 */
export function getWebViewOriginWhitelist(
  extraPrefixes: readonly string[] = [],
): string[] {
  // WebView originWhitelist matches origins (scheme/host), not full file paths.
  // Allow local file origin; onShouldStartLoadWithRequest enforces path scope.
  const list = ["file://*"];
  for (const prefix of extraPrefixes) {
    if (prefix) list.push(`${prefix}*`);
  }
  return list;
}

/** @deprecated Prefer getWebViewOriginWhitelist(); Android-only snapshot. */
export const WEBVIEW_ORIGIN_WHITELIST = getWebViewOriginWhitelist();

/** Allow top-level WebView navigation to packaged asset UI only. */
export function isAllowedWebViewNavigationUrl(
  url: string,
  extraPrefixes: readonly string[] = [],
): boolean {
  // iOS may probe with an empty URL before the real file:// navigation.
  if (!url) return true;
  const lower = normalizeIosFileUrl(url).toLowerCase();
  if (lower === "about:blank") return true;
  if (lower.startsWith(ANDROID_UI_ASSET_PREFIX)) return true;
  for (const prefix of extraPrefixes) {
    if (prefix && lower.startsWith(normalizeIosFileUrl(prefix).toLowerCase()))
      return true;
  }
  if (isIosAppBundleUiFileUrl(url)) return true;
  return false;
}
