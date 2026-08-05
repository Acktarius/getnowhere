#!/usr/bin/env node
/** Ensure android/ exists, stage assets/ui for WebView file:// load, then run. */
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const uiSrc = join(root, "assets", "ui");
const androidDir = join(root, "android");
const androidAssets = join(androidDir, "app", "src", "main", "assets", "ui");

if (!existsSync(join(uiSrc, "index.html"))) {
  console.error(
    "Missing assets/ui/index.html — run sync-ui-dist (or npm run mobile:sync-ui) first.",
  );
  process.exit(1);
}

if (!existsSync(androidDir)) {
  console.log("Running expo prebuild --platform android (first time)…");
  execSync("npx expo prebuild --platform android", {
    cwd: root,
    stdio: "inherit",
  });
}

rmSync(androidAssets, { recursive: true, force: true });
mkdirSync(androidAssets, { recursive: true });
cpSync(uiSrc, androidAssets, { recursive: true });
console.log(`Staged WebView bundle → ${androidAssets}`);
