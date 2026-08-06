#!/usr/bin/env node
/** Run bare/swarm security tests (symlink sidecar deps if needed). */
import { execSync } from "node:child_process";
import { existsSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bareDir = join(root, "bare");
const bareModules = join(bareDir, "node_modules");
const sidecarModules = join(root, "..", "holepunch-sidecar", "node_modules");

if (!existsSync(sidecarModules)) {
  console.error("Run npm run holepunch:install from repo root first.");
  process.exit(1);
}

if (!existsSync(bareModules)) {
  symlinkSync(sidecarModules, bareModules, "dir");
}

execSync("node --test test/swarm-security.test.mjs test/bridge-auth.test.mjs", {
  cwd: bareDir,
  stdio: "inherit",
});
