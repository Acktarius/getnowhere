/**
 * Bundled Vite UI file:// URIs for WebView.
 * Android: android_asset. iOS: app-bundle ui/ (copied by withGnhIosUiBundle).
 * @see docs/builds/expo-eas-ios-build.md
 * @see docs/architecture/mobile-p2p-runtime.md
 */
import { bundleDirectory } from "expo-file-system/legacy";
import { Platform } from "react-native";
import {
  ANDROID_UI_ASSET_PREFIX,
  buildIosBundledUiPaths,
} from "./webviewNavigation";

/** Absolute file:// URI to index.html, or null if unavailable. */
export function getBundledUiIndexUri(): string | null {
  if (Platform.OS === "android") {
    return `${ANDROID_UI_ASSET_PREFIX}index.html`;
  }
  if (Platform.OS === "ios") {
    if (!bundleDirectory) return null;
    return buildIosBundledUiPaths(bundleDirectory).indexUri;
  }
  return null;
}

/**
 * Trailing-slash prefix for the iOS navigation allowlist.
 * Same canonical base as source + read access.
 */
export function getIosUiAssetPrefix(): string | null {
  if (Platform.OS !== "ios" || !bundleDirectory) return null;
  return buildIosBundledUiPaths(bundleDirectory).assetPrefix;
}

/**
 * iOS WKWebView allowingReadAccessToURL — scoped to ui/ only.
 * Must match the canonical form of the index URI parent path.
 */
export function getBundledUiReadAccessUrl(): string | undefined {
  if (Platform.OS !== "ios" || !bundleDirectory) return undefined;
  return buildIosBundledUiPaths(bundleDirectory).readAccessUrl;
}
