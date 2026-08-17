#!/usr/bin/env node
/** Unsigned release APK — sync assets, apply `version` file, gradle assembleRelease. @see docs/builds/expo-eas-android-build.md */
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAppVersion } from "./load-app-version.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = join(root, "android");
const gradlew = join(androidDir, "gradlew");
const appVersion = loadAppVersion();

console.log("Get NowHere Android release (unsigned)");
console.log(`  version:              ${appVersion.version}`);
console.log(`  buildVersionAndroid:  ${appVersion.buildVersionAndroid}`);
console.log("");

const repoRoot = join(root, "..");

console.log("Syncing Vite UI bundle (npm run mobile:sync-ui)…");
execSync("npm run mobile:sync-ui", { cwd: repoRoot, stdio: "inherit" });

console.log("Preparing Android assets…");
execSync("node scripts/prepare-android-assets.mjs", { cwd: root, stdio: "inherit" });

console.log("Applying version + unsigned release Gradle hooks…");
execSync("node scripts/apply-android-version.mjs", { cwd: root, stdio: "inherit" });

if (!existsSync(gradlew)) {
  console.error(`Missing gradlew at ${gradlew}`);
  process.exit(1);
}

console.log("Gradle assembleRelease (unsigned)…");
// Skip `./gradlew clean` — RN new-arch clean hits missing codegen JNI dirs on Debug.
const releaseDir = join(androidDir, "app", "build", "outputs", "apk", "release");
rmSync(releaseDir, { recursive: true, force: true });
execSync("./gradlew assembleRelease", {
  cwd: androidDir,
  stdio: "inherit",
});

const candidates = [
  join(releaseDir, "app-release-unsigned.apk"),
  join(releaseDir, "app-release.apk"),
];

let unsignedApk = "";
for (const candidate of candidates) {
  if (existsSync(candidate)) {
    unsignedApk = candidate;
    break;
  }
}

if (!unsignedApk) {
  console.error(`Release APK not found under ${releaseDir}`);
  process.exit(1);
}

let javaMajor = "unknown";
try {
  const javaVersionLine = execSync("java -version 2>&1 | head -n 1", {
    encoding: "utf8",
    shell: "/bin/bash",
  }).trim();
  const match = javaVersionLine.match(/"([^"]+)"/);
  if (match) javaMajor = match[1].split(".")[0];
} catch {
  // optional label only
}

const outputDir = join(root, "builds");
mkdirSync(outputDir, { recursive: true });
const outputApk = join(
  outputDir,
  `GetNowHere-v${appVersion.version}-b${appVersion.buildVersionAndroid}-java${javaMajor}.apk`,
);
cpSync(unsignedApk, outputApk);

const sha256 = execSync(`sha256sum "${outputApk}"`, { encoding: "utf8" })
  .trim()
  .split(/\s+/)[0];
writeFileSync(`${outputApk}.sha256`, `${sha256}\n`);

console.log("");
console.log("Unsigned release APK ready for signing:");
console.log(`  ${outputApk}`);
console.log(`  SHA256: ${sha256}`);
