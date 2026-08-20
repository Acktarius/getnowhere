#!/usr/bin/env node
/** Copy root Vite dist/ into assets/ui/ for WebView loading. @see docs/builds/expo-eas-android-build.md */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditBundledUiHtml,
  stripExternalStylesheetLinks,
} from "./bundled-ui-audit.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "..", "dist");
const targetDir = join(root, "assets", "ui");

if (!existsSync(join(distDir, "index.html"))) {
  console.error(
    "Missing ../dist/index.html — run `npm run build` from the repo root first.",
  );
  process.exit(1);
}

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(targetDir, { recursive: true });
cpSync(distDir, targetDir, { recursive: true });

const indexPath = join(targetDir, "index.html");
let html = readFileSync(indexPath, "utf8");
html = stripExternalStylesheetLinks(html);
writeFileSync(indexPath, html);
auditBundledUiHtml(html);

console.log(`Synced ${distDir} → ${targetDir} (mobile UI audit OK)`);
