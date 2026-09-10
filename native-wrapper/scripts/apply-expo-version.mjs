#!/usr/bin/env node
/** Write `expo.version` in app.json from repo-root `version`. @see docs/builds/expo-eas-ios-build.md */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadAppVersion } from "./load-app-version.mjs";

const wrapperRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultVersionPath = join(wrapperRoot, "..", "version");
const defaultAppJsonPath = join(wrapperRoot, "app.json");

/**
 * @param {{ versionPath?: string; appJsonPath?: string }} [paths]
 * @returns {{ previous: string; version: string; changed: boolean }}
 */
export function applyExpoVersion(paths = {}) {
  const versionPath = paths.versionPath ?? defaultVersionPath;
  const appJsonPath = paths.appJsonPath ?? defaultAppJsonPath;

  if (!existsSync(versionPath)) {
    throw new Error(`Missing version file: ${versionPath}`);
  }
  if (!existsSync(appJsonPath)) {
    throw new Error(`Missing app.json: ${appJsonPath}`);
  }

  const appVersion = loadAppVersion(versionPath);
  if (!/^\d+\.\d+\.\d+/.test(appVersion.version)) {
    throw new Error(`Invalid version= in ${versionPath}: ${appVersion.version}`);
  }

  const text = readFileSync(appJsonPath, "utf8");
  const previous = JSON.parse(text)?.expo?.version;
  if (typeof previous !== "string") {
    throw new Error(`app.json is missing expo.version: ${appJsonPath}`);
  }

  const updated = text.replace(/("version"\s*:\s*")([^"]*)(")/, `$1${appVersion.version}$3`);
  if (JSON.parse(updated)?.expo?.version !== appVersion.version) {
    throw new Error(`Failed to set expo.version to ${appVersion.version} in ${appJsonPath}`);
  }

  const changed = updated !== text;
  if (changed) {
    writeFileSync(appJsonPath, updated);
  }
  return { previous, version: appVersion.version, changed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = applyExpoVersion();
  if (result.changed) {
    console.log(`Synced expo.version → ${result.version}`);
  } else {
    console.log(`expo.version already ${result.version}`);
  }
}
