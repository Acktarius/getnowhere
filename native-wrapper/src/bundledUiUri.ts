/**
 * Bundled Vite UI file:// URIs for WebView.
 * Android: android_asset. iOS: app-bundle ui/ (copied by withGnhIosUiBundle).
 * @see docs/builds/expo-eas-ios-build.md
 */
import { bundleDirectory } from "expo-file-system/legacy";
import { Platform } from "react-native";
import { ANDROID_UI_ASSET_PREFIX } from "./webviewNavigation";

/** Absolute file:// URI to index.html, or null if unavailable. */
export function getBundledUiIndexUri(): string | null {
  if (Platform.OS === "android") {
    return `${ANDROID_UI_ASSET_PREFIX}index.html`;
  }
  if (Platform.OS === "ios") {
    if (!bundleDirectory) return null;
    return `${bundleDirectory}ui/index.html`;
  }
  return null;
}

/** Trailing-slash prefix for iOS allowlist; null on Android. */
export function getIosUiAssetPrefix(): string | null {
  if (Platform.OS !== "ios" || !bundleDirectory) return null;
  return `${bundleDirectory}ui/`;
}

/** iOS WKWebView allowingReadAccessToURL (ui directory). */
export function getBundledUiReadAccessUrl(): string | undefined {
  const prefix = getIosUiAssetPrefix();
  if (!prefix) return undefined;
  return prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
}
