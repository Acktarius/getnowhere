#!/usr/bin/env node
/** Stage UI + Bare bundles into android/app/src/main/assets/. */
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const uiSrc = join(root, "assets", "ui");
const bareSrc = join(root, "assets", "bare", "app.bundle");
const androidDir = join(root, "android");
const androidUiAssets = join(androidDir, "app", "src", "main", "assets", "ui");
const androidBareAssets = join(androidDir, "app", "src", "main", "assets", "bare");

if (!existsSync(join(uiSrc, "index.html"))) {
  console.error(
    "Missing assets/ui/index.html — run sync-ui-dist (or npm run mobile:sync-ui) first.",
  );
  process.exit(1);
}

console.log("Packing Bare worklet…");
execSync("node scripts/pack-bare.mjs", { cwd: root, stdio: "inherit" });

if (!existsSync(bareSrc)) {
  console.error("Missing assets/bare/app.bundle after pack-bare.");
  process.exit(1);
}

if (!existsSync(androidDir)) {
  console.log("Running expo prebuild --platform android (first time)…");
  execSync("npx expo prebuild --platform android", {
    cwd: root,
    stdio: "inherit",
  });
}

rmSync(androidUiAssets, { recursive: true, force: true });
mkdirSync(androidUiAssets, { recursive: true });
cpSync(uiSrc, androidUiAssets, { recursive: true });
console.log(`Staged WebView bundle → ${androidUiAssets}`);

rmSync(androidBareAssets, { recursive: true, force: true });
mkdirSync(androidBareAssets, { recursive: true });
cpSync(bareSrc, join(androidBareAssets, "app.bundle"));
console.log(`Staged Bare bundle → ${androidBareAssets}`);

execSync("node scripts/link-bare-addons.mjs", { cwd: root, stdio: "inherit" });
ensureBareAddonsGradle(join(androidDir, "app", "build.gradle"));

execSync("node scripts/refresh-android-launcher.mjs", {
  cwd: root,
  stdio: "inherit",
});

/** Ensure app packages linked Bare .so files from src/main/addons. */
function ensureBareAddonsGradle(buildGradlePath) {
  const marker = "jniLibs.srcDirs += ['src/main/addons']";
  let gradle = readFileSync(buildGradlePath, "utf8");
  if (gradle.includes(marker)) return;

  const needle = "androidResources {";
  if (!gradle.includes(needle)) {
    console.warn("Could not patch app/build.gradle for Bare addons jniLibs.");
    return;
  }

  gradle = gradle.replace(
    needle,
    `sourceSets {\n        main {\n            ${marker}\n        }\n    }\n    ${needle}`,
  );
  writeFileSync(buildGradlePath, gradle);
  console.log("Patched app/build.gradle for Bare addon jniLibs.");
}
