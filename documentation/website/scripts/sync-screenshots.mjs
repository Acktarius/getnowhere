/**
 * Copy Fastlane phone screenshots into public/ for the static docs site.
 * Source of truth: fastlane/metadata/android/en-US/images/phoneScreenshots/
 */
import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const websiteDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(websiteDir, "../..");
const srcDir = path.join(
  repoRoot,
  "fastlane/metadata/android/en-US/images/phoneScreenshots",
);
const destDir = path.join(websiteDir, "public/screenshots");

mkdirSync(destDir, { recursive: true });
for (const file of ["1.png", "2.png", "3.png"]) {
  cpSync(path.join(srcDir, file), path.join(destDir, file));
}
