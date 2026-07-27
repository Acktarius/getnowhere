/**
 * Electron shell: embedded Vite dist (packaged) or local Vite (dev) + sidecar child.
 * @see docs/architecture/electron-desktop.md
 * @see docs/builds/github-pages-and-desktop.md
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app, BrowserWindow, Menu, session } from "electron";
import { getUfwAdvisory } from "./firewall-status.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const ROLE = (process.env.GNH_ROLE ?? "alice").toLowerCase();
const ROLE_LABEL = ROLE === "bob" ? "Bob" : "Alice";

/** @type {"shared" | "isolated"} */
const SWARM_MODE = (process.env.GNH_SWARM_MODE ?? "shared").toLowerCase();
const isIsolated = SWARM_MODE === "isolated";

const defaultPort = isIsolated && ROLE === "bob" ? 7902 : 7901;
const SWARM_HOST = process.env.HOLEPUNCH_HOST ?? "127.0.0.1";
const SWARM_PORT = Number(process.env.HOLEPUNCH_PORT ?? defaultPort);

const BASE_WS_URL =
  process.env.GNH_HOLEPUNCH_WS_URL ?? `ws://${SWARM_HOST}:${SWARM_PORT}`;

/**
 * Packaged: load embedded `resources/ui/index.html` (Vite `dist/`).
 * Dev: Vite at 5173. `GNH_UI_URL` overrides either (http or file).
 */
function resolveUiTarget() {
  if (process.env.GNH_UI_URL?.trim()) {
    return { kind: "url", value: process.env.GNH_UI_URL.trim() };
  }
  if (app.isPackaged) {
    const indexHtml = join(process.resourcesPath, "ui", "index.html");
    if (!existsSync(indexHtml)) {
      throw new Error(`Packaged UI missing: ${indexHtml}`);
    }
    return { kind: "file", value: indexHtml };
  }
  return { kind: "url", value: "http://127.0.0.1:5173" };
}

/**
 * Dev: repo holepunch-sidecar + system node.
 * Packaged: resources/sidecar + resources/runtime/node.
 */
function sidecarLaunch() {
  if (app.isPackaged) {
    const root = join(process.resourcesPath, "sidecar");
    return {
      entry: join(root, "src", "server.mjs"),
      cwd: root,
      nodeBin:
        process.env.GNH_NODE_BIN ??
        join(process.resourcesPath, "runtime", "node"),
    };
  }
  return {
    entry: join(repoRoot, "holepunch-sidecar", "src", "server.mjs"),
    cwd: join(repoRoot, "holepunch-sidecar"),
    nodeBin: process.env.GNH_NODE_BIN ?? "node",
  };
}

/**
 * Shared-mode token handoff: owner writes token to a tmp lockfile; attacher reads it.
 * Prevents Bob generating a different UUID than Alice's sidecar expects.
 */
function tokenLockPath() {
  const safeHost = SWARM_HOST.replace(/[^\w.-]/g, "_");
  return join(tmpdir(), `gnh-sidecar-${safeHost}-${SWARM_PORT}.token`);
}

function writeTokenLock(token) {
  writeFileSync(tokenLockPath(), token, { encoding: "utf8", mode: 0o600 });
}

function readTokenLock() {
  const path = tokenLockPath();
  if (!existsSync(path)) return null;
  try {
    const token = readFileSync(path, "utf8").trim();
    return token || null;
  } catch {
    return null;
  }
}

function clearTokenLock() {
  try {
    unlinkSync(tokenLockPath());
  } catch {
    /* ignore */
  }
}

/** Mutable: owner keeps token; attacher replaces with lockfile / shared default. */
let authToken =
  process.env.GNH_SIDECAR_TOKEN ??
  (isIsolated ? randomUUID() : "gnh-desktop-shared");

/** @type {import('node:child_process').ChildProcess | null} */
let swarmChild = null;
let ownsSwarm = false;
/** @type {BrowserWindow | null} */
let mainWindow = null;
let shuttingDown = false;
/** Read-only, privilege-free advisory — never a firewall-mutation trigger. */
let ufwAdvisory = { state: "unknown", reason: "not-checked" };

app.setName(`getnowhere-desktop-${ROLE}`);
app.setPath(
  "userData",
  join(app.getPath("appData"), `getnowhere-desktop-${ROLE}`),
);

function log(...args) {
  console.log(`[desktop:${ROLE}]`, ...args);
}

function portOpen(host, port, timeoutMs = 400) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const done = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function waitForPort(host, port, attempts = 50, delayMs = 100) {
  for (let i = 0; i < attempts; i++) {
    if (await portOpen(host, port)) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

function windowTitle(tag) {
  return `Get Now Here — ${ROLE_LABEL} [${tag}]`;
}

/** Attacher: reuse owner's token from lockfile (or shared default / env). */
function adoptSharedToken() {
  const fromLock = readTokenLock();
  const fromEnv = process.env.GNH_SIDECAR_TOKEN?.trim() || null;
  authToken = fromLock ?? fromEnv ?? "gnh-desktop-shared";
  if (fromLock) {
    log(`shared token from lockfile ${tokenLockPath()}`);
  } else if (fromEnv) {
    log("shared token from GNH_SIDECAR_TOKEN env");
  } else {
    log("shared token default gnh-desktop-shared");
  }
}

async function spawnSidecar() {
  const { entry, cwd, nodeBin } = sidecarLaunch();
  if (!existsSync(entry)) {
    throw new Error(`Sidecar entry missing: ${entry}`);
  }
  if (!existsSync(nodeBin) && nodeBin !== "node") {
    throw new Error(`Bundled Node missing: ${nodeBin}`);
  }

  log(
    `spawning Hyperswarm sidecar (${nodeBin}) on ${SWARM_HOST}:${SWARM_PORT}`,
  );

  swarmChild = spawn(nodeBin, [entry], {
    stdio: "inherit",
    env: {
      ...process.env,
      HOLEPUNCH_HOST: SWARM_HOST,
      HOLEPUNCH_PORT: String(SWARM_PORT),
      GNH_SIDECAR_TOKEN: authToken,
    },
    cwd,
  });

  swarmChild.on("exit", (code, signal) => {
    log(`swarm child exited code=${code} signal=${signal}`);
    swarmChild = null;
    ownsSwarm = false;
    clearTokenLock();
  });

  const ok = await waitForPort(SWARM_HOST, SWARM_PORT);
  if (!ok) {
    swarmChild?.kill("SIGTERM");
    swarmChild = null;
    clearTokenLock();
    throw new Error(
      `Hyperswarm bridge did not listen on ${SWARM_HOST}:${SWARM_PORT}.\n` +
        (app.isPackaged
          ? "Packaged sidecar failed to start."
          : "Run: npm run holepunch:install"),
    );
  }
  ownsSwarm = true;
  writeTokenLock(authToken);
  log(`owned Hyperswarm bridge ready at ${BASE_WS_URL} (token lock written)`);
}

async function ensureLocalSwarm() {
  if (isIsolated) {
    await spawnSidecar();
    return;
  }

  if (await portOpen(SWARM_HOST, SWARM_PORT)) {
    ownsSwarm = false;
    adoptSharedToken();
    log(`attaching to existing Hyperswarm bridge at ${BASE_WS_URL}`);
    return;
  }

  try {
    await spawnSidecar();
  } catch {
    if (await waitForPort(SWARM_HOST, SWARM_PORT, 20, 100)) {
      ownsSwarm = false;
      adoptSharedToken();
      log(`attached to peer-owned Hyperswarm bridge at ${BASE_WS_URL}`);
      return;
    }
    throw new Error(
      `Hyperswarm bridge did not listen on ${SWARM_HOST}:${SWARM_PORT}.\n` +
        (app.isPackaged
          ? "Packaged sidecar failed to start."
          : "Run: npm run holepunch:install"),
    );
  }
}

async function stopOwnedSwarm() {
  if (!swarmChild) return;
  log("stopping owned Hyperswarm sidecar");
  const child = swarmChild;
  swarmChild = null;
  ownsSwarm = false;
  clearTokenLock();
  await new Promise((resolve) => {
    const t = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      resolve();
    }, 2000);
    child.once("exit", () => {
      clearTimeout(t);
      resolve();
    });
    try {
      child.kill("SIGTERM");
    } catch {
      clearTimeout(t);
      resolve();
    }
  });
}

async function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`shutdown (${reason})${ownsSwarm || swarmChild ? " + swarm" : ""}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.removeAllListeners("close");
    try {
      mainWindow.destroy();
    } catch {
      /* ignore */
    }
    mainWindow = null;
  }
  await stopOwnedSwarm();
  app.exit(0);
}

function createWindow() {
  const partition = `persist:gnh-${ROLE}`;
  const ses = session.fromPartition(partition);

  const modeTag = isIsolated
    ? "isolated"
    : ownsSwarm
      ? "shared:owner"
      : "shared:attach";

  // Match `.app-shell` desktop max-width (760) + ≥768 media query; do not change CSS layout.
  mainWindow = new BrowserWindow({
    width: 780,
    height: 800,
    title: windowTitle(modeTag),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition,
      session: ses,
      additionalArguments: [
        `--gnh-role=${ROLE}`,
        `--gnh-holepunch-ws=${BASE_WS_URL}`,
        `--gnh-ws-token=${authToken}`,
        `--gnh-ufw-state=${ufwAdvisory.state}`,
      ],
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.setMenuBarVisibility(false);

  const desktopInfo = JSON.stringify({
    role: ROLE,
    holepunchWsUrl: BASE_WS_URL,
    wsToken: authToken,
    ufwState: ufwAdvisory.state,
  });
  mainWindow.webContents.on("did-finish-load", () => {
    void mainWindow?.webContents.executeJavaScript(
      `window.__GNH_DESKTOP__ = ${desktopInfo};`,
    );
  });

  mainWindow.on("close", (event) => {
    if (shuttingDown) return;
    event.preventDefault();
    void shutdown("window-close");
  });

  const ui = resolveUiTarget();
  const uiLabel =
    ui.kind === "file" ? pathToFileURL(ui.value).href : ui.value;
  log(`loading UI ${uiLabel} (partition ${partition}, mode=${SWARM_MODE})`);
  if (ui.kind === "file") {
    void mainWindow.loadFile(ui.value);
  } else {
    void mainWindow.loadURL(ui.value);
  }
}

app.whenReady().then(async () => {
  try {
    // Best-effort and privilege-free — never blocks or fails startup.
    ufwAdvisory = await getUfwAdvisory().catch(() => ({
      state: "unknown",
      reason: "check-failed",
    }));
    log(`UFW advisory: ${ufwAdvisory.state} (${ufwAdvisory.reason})`);
    await ensureLocalSwarm();
    createWindow();
  } catch (e) {
    console.error(e);
    await stopOwnedSwarm();
    app.exit(1);
  }
});

app.on("window-all-closed", () => {
  void shutdown("window-all-closed");
});

app.on("before-quit", (event) => {
  if (shuttingDown) return;
  event.preventDefault();
  void shutdown("before-quit");
});
