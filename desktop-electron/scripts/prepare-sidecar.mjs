/**
 * Stage sidecar + Node runtime + Vite `dist/` under resources/ for Forge.
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
const uiOut = join(resources, "ui");

const NODE_VERSION = process.env.GNH_BUNDLE_NODE_VERSION ?? "24.14.1";

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

/** Copy repo-root Vite `dist/` into resources/ui (required for packaged loadFile). */
function stageUi() {
  const dist = join(repoRoot, "dist");
  const indexHtml = join(dist, "index.html");
  if (!existsSync(indexHtml)) {
    throw new Error(
      `UI dist missing: ${indexHtml}\nRun: npm run build (repo root) before desktop:make`,
    );
  }
  rmSync(uiOut, { recursive: true, force: true });
  mkdirSync(uiOut, { recursive: true });
  cpSync(dist, uiOut, { recursive: true });
  log(`staged UI → ${uiOut}`);
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

mkdirSync(resources, { recursive: true });
stageUi();
stageSidecar();
await stageNodeRuntime();
log("done");
