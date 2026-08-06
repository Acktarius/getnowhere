/** Packaged UI root on Android (file:// under android_asset). */
export const ANDROID_UI_ASSET_PREFIX = "file:///android_asset/ui/";

/** react-native-webview originWhitelist entries for the bundled UI only. */
export const WEBVIEW_ORIGIN_WHITELIST = [`${ANDROID_UI_ASSET_PREFIX}*`];

/** Allow top-level WebView navigation to packaged asset UI only. */
export function isAllowedWebViewNavigationUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (lower === "about:blank") return true;
  return lower.startsWith(ANDROID_UI_ASSET_PREFIX);
}
