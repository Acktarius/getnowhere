#!/usr/bin/env node
/** Write version.properties and patch android/app/build.gradle for release versioning. */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAppVersion } from "./load-app-version.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const buildGradlePath = join(root, "android", "app", "build.gradle");
const versionPropsPath = join(root, "version.properties");
const versionGradleApply = 'apply from: "../../gradle/app-version.gradle"';
const versionGradleMarker = "// GNH_APP_VERSION_GRADLE";
const unsignedMarker = "// GNH_UNSIGNED_RELEASE";

const appVersion = loadAppVersion();

writeFileSync(
  versionPropsPath,
  [
    `version=${appVersion.version}`,
    `buildVersionAndroid=${appVersion.buildVersionAndroid}`,
    `buildversionIos=${appVersion.buildversionIos}`,
    "",
  ].join("\n"),
);
console.log(
  `Wrote ${versionPropsPath} (version=${appVersion.version}, buildVersionAndroid=${appVersion.buildVersionAndroid})`,
);

let gradle = readFileSync(buildGradlePath, "utf8");

if (!gradle.includes(versionGradleMarker)) {
  gradle = `${gradle.trimEnd()}\n\n${versionGradleMarker}\n${versionGradleApply}\n`;
  console.log("Applied app-version.gradle hook.");
}

if (!gradle.includes(unsignedMarker)) {
  gradle = gradle.replace(
    /signingConfig signingConfigs\.debug\n(\s+def enableShrinkResources)/,
    `${unsignedMarker}\n$1`,
  );
  console.log("Patched release buildType for unsigned APK (F-Droid / apksigner later).");
}

writeFileSync(buildGradlePath, gradle);
