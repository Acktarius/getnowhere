#!/usr/bin/env node
/** Link Bare native addons (hyperswarm deps) into the Android app. @see bare-link */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import link from "bare-link";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bareDir = join(root, "bare");
const androidDir = join(root, "android");
const outDir = join(androidDir, "app", "src", "main", "addons");

if (!existsSync(join(bareDir, "node_modules"))) {
  console.error(
    "Missing bare/node_modules — run npm run holepunch:install and npm run mobile:install first.",
  );
  process.exit(1);
}

if (!existsSync(androidDir)) {
  console.error("Missing android/ — run npx expo prebuild --platform android first.");
  process.exit(1);
}

console.log(`Linking Bare addons from ${bareDir} → ${outDir}`);

for await (const resource of link(bareDir, {
  hosts: ["android-arm64", "android-arm"],
  out: outDir,
})) {
  console.log(`  ${resource}`);
}
