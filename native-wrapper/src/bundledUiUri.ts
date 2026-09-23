/**
 * Bundled Vite UI file:// URIs for WebView.
 * Android: android_asset. iOS: app-bundle ui/ (copied by withGnhIosUiBundle).
 * @see docs/builds/expo-eas-ios-build.md
 */
import { bundleDirectory } from "expo-file-system/legacy";
import { Platform } from "react-native";
import {
  ANDROID_UI_ASSET_PREFIX,
  normalizeIosFileUrl,
} from "./webviewNavigation";

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

/**
 * Trailing-slash prefix for the iOS navigation allowlist.
 * Normalizes /var → /private/var so the prefix matches the symlink-resolved
 * URL that WKWebView reports in onShouldStartLoadWithRequest.
 */
export function getIosUiAssetPrefix(): string | null {
  if (Platform.OS !== "ios" || !bundleDirectory) return null;
  const base = bundleDirectory.endsWith("/")
    ? bundleDirectory
    : `${bundleDirectory}/`;
  return normalizeIosFileUrl(`${base}ui/`);
}

/**
 * iOS WKWebView allowingReadAccessToURL — scoped to ui/ only.
 * The /var → /private/var normalization ensures WKWebView accepts the URL
 * without broadening read access to the whole .app bundle root.
 * @see docs/architecture/mobile-p2p-runtime.md
 */
export function getBundledUiReadAccessUrl(): string | undefined {
  if (Platform.OS !== "ios" || !bundleDirectory) return undefined;
  const base = bundleDirectory.endsWith("/")
    ? bundleDirectory
    : `${bundleDirectory}/`;
  return normalizeIosFileUrl(`${base}ui`);
}
