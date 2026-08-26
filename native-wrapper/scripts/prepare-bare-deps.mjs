#!/usr/bin/env node
/**
 * Create bare/node_modules symlink before CocoaPods runs.
 * Must run in eas-build-pre-install so pod install (link.mjs) can find udx-native
 * prebuilds and emit the XCFramework. @see docs/builds/expo-eas-ios-build.md
 */
import { existsSync, lstatSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bareModules = join(root, "bare", "node_modules");
const sidecarModules = join(root, "..", "holepunch-sidecar", "node_modules");

if (!existsSync(sidecarModules)) {
  console.error(
    "Missing holepunch-sidecar/node_modules — eas-build-pre-install must install it first.",
  );
  process.exit(1);
}

if (existsSync(bareModules)) {
  const isSymlink = lstatSync(bareModules).isSymbolicLink();
  console.log(
    `bare/node_modules already exists (symlink=${isSymlink}), skipping.`,
  );
} else {
  console.log(`Linking bare/node_modules → holepunch-sidecar/node_modules`);
  symlinkSync(sidecarModules, bareModules, "dir");
}
