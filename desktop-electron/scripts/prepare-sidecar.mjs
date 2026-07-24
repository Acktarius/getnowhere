/**
 * Stage sidecar + Node runtime under resources/ for Electron Forge extraResource.
 * @see docs/builds/github-pages-and-desktop.md
 */

import { execFileSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = join(__dirname, "..");
const repoRoot = join(desktopRoot, "..");
const resources = join(desktopRoot, "resources");
const sidecarOut = join(resources, "sidecar");
const runtimeOut = join(resources, "runtime");

const NODE_VERSION = process.env.GNH_BUNDLE_NODE_VERSION ?? "24.14.1";
const UI_URL = process.env.GNH_PACKAGED_UI_URL ?? "http://127.0.0.1:5173";

function log(...args) {
  console.log("[prepare-sidecar]", ...args);
}

function stageSidecar() {
  rmSync(sidecarOut, { recursive: true, force: true });
  mkdirSync(sidecarOut, { recursive: true });
  const src = join(repoRoot, "holepunch-sidecar");
  for (const name of ["package.json", "package-lock.json", "src"]) {
    cpSync(join(src, name), join(sidecarOut, name), { recursive: true });
  }
  log("npm ci --omit=dev in resources/sidecar");
  execFileSync("npm", ["ci", "--omit=dev"], {
    cwd: sidecarOut,
    stdio: "inherit",
  });
}

async function stageNodeRuntime() {
  rmSync(runtimeOut, { recursive: true, force: true });
  mkdirSync(runtimeOut, { recursive: true });
  const nodeBin = join(runtimeOut, "node");
  if (
    process.env.GNH_SKIP_NODE_DOWNLOAD === "1" &&
    existsSync(process.execPath)
  ) {
    cpSync(process.execPath, nodeBin);
    chmodSync(nodeBin, 0o755);
    log(`copied process.execPath → ${nodeBin}`);
    return;
  }

  const arch = process.arch === "arm64" ? "arm64" : "x64";
  if (process.platform !== "linux") {
    // Dev on non-Linux: copy local node so forge package can still be smoke-tested.
    cpSync(process.execPath, nodeBin);
    chmodSync(nodeBin, 0o755);
    log(`non-linux: copied local node → ${nodeBin}`);
    return;
  }

  const base = `node-v${NODE_VERSION}-linux-${arch}`;
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${base}.tar.gz`;
  log(`download ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Node download failed: ${res.status} ${url}`);

  const tarPath = join(runtimeOut, `${base}.tar.gz`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tarPath));
  execFileSync("tar", ["-xzf", tarPath, "-C", runtimeOut], {
    stdio: "inherit",
  });
  cpSync(join(runtimeOut, base, "bin", "node"), nodeBin);
  chmodSync(nodeBin, 0o755);
  rmSync(join(runtimeOut, base), { recursive: true, force: true });
  rmSync(tarPath, { force: true });
  log(`staged ${nodeBin}`);
}

function writeDefaults() {
  const path = join(resources, "gnh-defaults.json");
  writeFileSync(path, `${JSON.stringify({ uiUrl: UI_URL }, null, 2)}\n`);
  log(`defaults uiUrl=${UI_URL}`);
}

mkdirSync(resources, { recursive: true });
stageSidecar();
await stageNodeRuntime();
writeDefaults();
log("done");
