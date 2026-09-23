/**
 * Packaged UI navigation allowlist for Android + iOS WebViews.
 * @see docs/architecture/mobile-p2p-runtime.md
 */

/** Packaged UI root on Android (file:// under android_asset). */
export const ANDROID_UI_ASSET_PREFIX = "file:///android_asset/ui/";

/**
 * Normalize iOS /var → /private/var symlink in a file:// URL.
 * WKWebView fires onShouldStartLoadWithRequest with the resolved path while
 * expo-file-system may return the /var form. Normalizing both sides allows a
 * reliable prefix comparison. @see docs/architecture/mobile-p2p-runtime.md
 */
export function normalizeIosFileUrl(url: string): string {
  return url.startsWith("file:///var/")
    ? `file:///private/var/${url.slice("file:///var/".length)}`
    : url;
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
  if (!url) return false;
  // Normalize /var → /private/var on both sides so iOS symlink form never matters.
  const lower = normalizeIosFileUrl(url).toLowerCase();
  if (lower === "about:blank") return true;
  if (lower.startsWith(ANDROID_UI_ASSET_PREFIX)) return true;
  for (const prefix of extraPrefixes) {
    if (prefix && lower.startsWith(normalizeIosFileUrl(prefix).toLowerCase()))
      return true;
  }
  return false;
}
