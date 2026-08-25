#!/usr/bin/env node
/** Pack Bare worklet bundle into native-wrapper/assets/bare/. */
import { execSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bareDir = join(root, "bare");
const outDir = join(root, "assets", "bare");
const outMjs = join(outDir, "app.bundle.mjs");
const outRaw = join(outDir, "app.bundle");
const bareModules = join(bareDir, "node_modules");
const sidecarModules = join(root, "..", "holepunch-sidecar", "node_modules");
const barePackBin = join(root, "node_modules", ".bin", "bare-pack");

if (!existsSync(sidecarModules)) {
  console.error(
    "Missing holepunch-sidecar/node_modules — run npm run holepunch:install from repo root first.",
  );
  process.exit(1);
}

if (!existsSync(bareModules)) {
  console.log("Linking bare worklet deps from holepunch-sidecar…");
  symlinkSync(sidecarModules, bareModules, "dir");
} else {
  try {
    if (!lstatSync(bareModules).isSymbolicLink()) {
      console.warn(
        "bare/node_modules exists and is not a symlink — using as-is for pack.",
      );
    }
  } catch {
    /* ignore */
  }
}

mkdirSync(outDir, { recursive: true });

const entry = process.env.BARE_ENTRY ?? "entry.mjs"; // optional alternate entry for pack debugging
const entryPath = join(bareDir, entry);
if (!existsSync(entryPath)) {
  console.error(`Missing bare entry: ${entryPath}`);
  process.exit(1);
}

console.log(`Packing Bare worklet (${entry}) → ${outMjs}`);

/** Match Expo device arches: Android arm64 APK + iPhone arm64 (TestFlight/EAS). */
const packArgs =
  `${entry} -o ../assets/bare/app.bundle.mjs --linked ` +
  `--host android-arm64 --host ios-arm64`;
const packCmd = existsSync(barePackBin)
  ? `"${barePackBin}" ${packArgs}`
  : `npx --yes bare-pack@2.2.1 ${packArgs}`;

execSync(packCmd, { cwd: bareDir, stdio: "inherit" });

const packed = await import(pathToFileURL(outMjs).href);
if (typeof packed.default !== "string") {
  console.error("bare-pack output missing string default export.");
  process.exit(1);
}
writeFileSync(outRaw, packed.default, "utf8");
console.log(`Extracted raw Bare bundle → ${outRaw}`);
