/**
 * Packaged UI navigation allowlist for Android + iOS WebViews.
 * @see docs/architecture/mobile-p2p-runtime.md
 */

/** Packaged UI root on Android (file:// under android_asset). */
export const ANDROID_UI_ASSET_PREFIX = "file:///android_asset/ui/";

/**
 * react-native-webview originWhitelist entries for the bundled UI.
 * Pass iOS `bundleDirectory + "ui/"` (with trailing slash) when available.
 */
export function getWebViewOriginWhitelist(
  extraPrefixes: readonly string[] = [],
): string[] {
  const list = [`${ANDROID_UI_ASSET_PREFIX}*`];
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
  const lower = url.toLowerCase();
  if (lower === "about:blank") return true;
  if (lower.startsWith(ANDROID_UI_ASSET_PREFIX)) return true;
  for (const prefix of extraPrefixes) {
    if (prefix && lower.startsWith(prefix.toLowerCase())) return true;
  }
  return false;
}
