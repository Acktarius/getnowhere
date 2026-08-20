/** Read mobile version fields from repo-root `version`. @see docs/builds/expo-eas-android-build.md */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** @typedef {{ version: string; buildVersionAndroid: string; buildversionIos: string }} AppVersion */

/** @param {string} [versionPath] @returns {AppVersion} */
export function loadAppVersion(versionPath = join(repoRoot, "version")) {
  /** @type {AppVersion} */
  const result = {
    version: "0.0.0",
    buildVersionAndroid: "1",
    buildversionIos: "1",
  };

  if (!existsSync(versionPath)) return result;

  for (const line of readFileSync(versionPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!value) continue;

    if (key === "version") result.version = value;
    if (key === "buildVersionAndroid" || key === "buildversionAndroid") {
      result.buildVersionAndroid = value;
    }
    if (key === "buildversionIos" || key === "buildVersionIos") {
      result.buildversionIos = value;
    }
  }

  return result;
}
