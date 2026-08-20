#!/usr/bin/env node
/** Regenerate android native resources (launcher + splash) from app.json / assets. */
import { execSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = join(root, "android");
const iconSrc = join(root, "assets", "icon.png");
const appJson = join(root, "app.json");
const mipmapProbe = join(
  root,
  "android/app/src/main/res/mipmap-mdpi/ic_launcher.webp",
);
const splashSrc = join(root, "assets", "splash-icon.png");
const splashProbe = join(
  root,
  "android/app/src/main/res/drawable-mdpi/splashscreen_logo.png",
);
const colorsXml = join(root, "android/app/src/main/res/values/colors.xml");
const PAGE_BG = "#0a0b0f";

if (!existsSync(iconSrc)) {
  console.error("Missing assets/icon.png — run npm run generate:icons first.");
  process.exit(1);
}

if (!existsSync(androidDir)) {
  console.log("android/ missing — expo prebuild runs on first mobile:android.");
  process.exit(0);
}

const iconsNewer =
  !existsSync(mipmapProbe) ||
  statSync(iconSrc).mtimeMs > statSync(mipmapProbe).mtimeMs;

const splashNewer =
  existsSync(splashSrc) &&
  (!existsSync(splashProbe) ||
    statSync(splashSrc).mtimeMs > statSync(splashProbe).mtimeMs);

let splashStale = false;
if (existsSync(colorsXml)) {
  const colors = readFileSync(colorsXml, "utf8");
  splashStale = !colors.includes(`splashscreen_background">${PAGE_BG}`);
} else {
  splashStale = true;
}

const appJsonNewer =
  existsSync(appJson) &&
  existsSync(colorsXml) &&
  statSync(appJson).mtimeMs > statSync(colorsXml).mtimeMs;

if (!iconsNewer && !splashNewer && !splashStale && !appJsonNewer) {
  console.log("Android launcher + splash resources up to date.");
  process.exit(0);
}

console.log("Refreshing android native resources (expo prebuild)…");
execSync("npx expo prebuild --platform android --no-install", {
  cwd: root,
  stdio: "inherit",
});

const uiSrc = join(root, "assets", "ui");
const androidUi = join(androidDir, "app", "src", "main", "assets", "ui");
if (existsSync(join(uiSrc, "index.html"))) {
  rmSync(androidUi, { recursive: true, force: true });
  mkdirSync(androidUi, { recursive: true });
  cpSync(uiSrc, androidUi, { recursive: true });
  console.log(`Re-staged WebView bundle → ${androidUi}`);
}

console.log("Updated mipmap-* and splash (background matches app --bg).");
