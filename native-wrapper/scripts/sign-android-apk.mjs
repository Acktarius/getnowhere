#!/usr/bin/env node
/** Sign an APK with the Expo/RN debug keystore for local sideload only. @see docs/builds/expo-eas-android-build.md */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const androidHome = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? "";
const inputArg = process.argv[2];

/** @returns {string | undefined} */
function latestUnsignedApk() {
  const buildsDir = join(root, "builds");
  if (!existsSync(buildsDir)) return undefined;
  const apks = readdirSync(buildsDir)
    .filter((name) => name.endsWith(".apk") && !name.includes("-signed-test"))
    .map((name) => join(buildsDir, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return apks[0];
}

const inputApk = inputArg ?? latestUnsignedApk();

if (!inputApk) {
  console.error(
    "Usage: node scripts/sign-android-apk.mjs [unsigned.apk]\n" +
      "  With no path, signs the newest *.apk in native-wrapper/builds/ (excluding *-signed-test.apk).",
  );
  process.exit(1);
}

if (!existsSync(inputApk)) {
  console.error(`APK not found: ${inputApk}`);
  process.exit(1);
}

const debugKeystore = join(root, "android", "app", "debug.keystore");
if (!existsSync(debugKeystore)) {
  console.error(
    `Missing ${debugKeystore} — run npm run mobile:android once (expo prebuild) first.`,
  );
  process.exit(1);
}

if (!androidHome) {
  console.error("Set ANDROID_HOME (or ANDROID_SDK_ROOT) to locate apksigner.");
  process.exit(1);
}

const buildToolsDir = join(androidHome, "build-tools");
const buildToolsVersion = readdirSync(buildToolsDir)
  .filter((name) => existsSync(join(buildToolsDir, name, "apksigner")))
  .sort()
  .at(-1);

if (!buildToolsVersion) {
  console.error(`No apksigner under ${buildToolsDir}`);
  process.exit(1);
}

const apksigner = join(buildToolsDir, buildToolsVersion, "apksigner");
const outputApk = inputApk.replace(/\.apk$/i, "-signed-test.apk");

console.log("Signing with debug keystore (local testing only — not for store/F-Droid):");
console.log(`  in:  ${inputApk}`);
console.log(`  out: ${outputApk}`);

execSync(
  [
    `"${apksigner}" sign`,
    `--ks "${debugKeystore}"`,
    "--ks-pass pass:android",
    "--key-pass pass:android",
    `--out "${outputApk}"`,
    `"${inputApk}"`,
  ].join(" "),
  { stdio: "inherit", shell: "/bin/bash" },
);

execSync(`"${apksigner}" verify "${outputApk}"`, { stdio: "inherit", shell: "/bin/bash" });

console.log("");
console.log("Install on device:");
console.log(`  adb install -r "${outputApk}"`);
