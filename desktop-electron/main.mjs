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
import { app, BrowserWindow, ipcMain, Menu, session } from "electron";
import { resolveDesktopIdentity } from "./desktop-identity.mjs";
import { getUfwAdvisory } from "./firewall-status.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const identity = resolveDesktopIdentity({
  isPackaged: app.isPackaged,
  env: process.env,
});

const {
  role: ROLE,
  logPrefix: LOG_PREFIX,
  appName: APP_NAME,
  userDataDirName: USER_DATA_DIR,
  partition: PARTITION,
  titleBase: TITLE_BASE,
  showsModeTag: SHOWS_MODE_TAG,
  swarmMode: SWARM_MODE,
  host: SWARM_HOST,
  port: SWARM_PORT_REQUESTED,
  usesEphemeralPort: USES_EPHEMERAL_PORT,
  usesTokenLock: USES_TOKEN_LOCK,
  singleInstance: SINGLE_INSTANCE,
} = identity;

const isIsolated = SWARM_MODE === "isolated";

/** Resolved after ephemeral IPC handoff (or equals requested port in dev). */
let swarmPort = SWARM_PORT_REQUESTED;

const BASE_WS_URL_OVERRIDE = process.env.GNH_HOLEPUNCH_WS_URL?.trim() || null;

/**
 * Renderer pulls its bridge config over this synchronous channel instead of
 * `additionalArguments` / `executeJavaScript`, so the auth token never sits
 * in this process's command line (readable via /proc/<pid>/cmdline or `ps`
 * by any co-resident process) or in the page's main-world scope.
 * @see docs/architecture/electron-desktop.md
 */
const DESKTOP_INFO_CHANNEL = "gnh:get-desktop-info";

function bridgeWsBase() {
  return BASE_WS_URL_OVERRIDE ?? `ws://${SWARM_HOST}:${swarmPort}`;
}

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
  return join(tmpdir(), `gnh-sidecar-${safeHost}-${swarmPort}.token`);
}

function writeTokenLock(token) {
  if (!USES_TOKEN_LOCK) return;
  writeFileSync(tokenLockPath(), token, { encoding: "utf8", mode: 0o600 });
}

function readTokenLock() {
  if (!USES_TOKEN_LOCK) return null;
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
  if (!USES_TOKEN_LOCK) return;
  try {
    unlinkSync(tokenLockPath());
  } catch {
    /* ignore */
  }
}

/**
 * Mutable: owner keeps token; attacher replaces with lockfile / shared default.
 * Packaged builds always get a fresh per-launch token and ignore
 * GNH_SIDECAR_TOKEN entirely — same reasoning as GNH_ROLE / GNH_SWARM_MODE in
 * resolveDesktopIdentity (a harness env var must never reach a shipped build).
 */
let authToken = app.isPackaged
  ? randomUUID()
  : (process.env.GNH_SIDECAR_TOKEN ??
    (isIsolated ? randomUUID() : "gnh-desktop-shared"));

/** @type {import('node:child_process').ChildProcess | null} */
let swarmChild = null;
let ownsSwarm = false;
/** @type {BrowserWindow | null} */
let mainWindow = null;
let shuttingDown = false;
/** Read-only, privilege-free advisory — never a firewall-mutation trigger. */
let ufwAdvisory = { state: "unknown", reason: "not-checked" };

app.setName(APP_NAME);
app.setPath("userData", join(app.getPath("appData"), USER_DATA_DIR));

let isPrimaryInstance = true;
if (SINGLE_INSTANCE) {
  isPrimaryInstance = app.requestSingleInstanceLock();
  if (!isPrimaryInstance) {
    app.exit(0);
  } else {
    app.on("second-instance", () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  }
}

function log(...args) {
  console.log(LOG_PREFIX, ...args);
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
  if (!SHOWS_MODE_TAG) return TITLE_BASE;
  return `${TITLE_BASE} [${tag}]`;
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

/**
 * Wait for sidecar IPC `{ type: "listening", port }` with a bounded timeout.
 * @param {import('node:child_process').ChildProcess} child
 * @param {number} timeoutMs
 */
function waitForListeningIpc(child, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      cleanup();
      reject(new Error("sidecar did not report listening port over IPC"));
    }, timeoutMs);

    function onMessage(msg) {
      if (
        msg &&
        typeof msg === "object" &&
        msg.type === "listening" &&
        typeof msg.port === "number" &&
        msg.port > 0
      ) {
        cleanup();
        resolve(msg);
      }
    }

    function onExit(code, signal) {
      cleanup();
      reject(
        new Error(
          `sidecar exited before listening IPC (code=${code} signal=${signal})`,
        ),
      );
    }

    function cleanup() {
      clearTimeout(t);
      child.off("message", onMessage);
      child.off("exit", onExit);
    }

    child.on("message", onMessage);
    child.on("exit", onExit);
  });
}

async function spawnSidecar() {
  const { entry, cwd, nodeBin } = sidecarLaunch();
  if (!existsSync(entry)) {
    throw new Error(`Sidecar entry missing: ${entry}`);
  }
  if (!existsSync(nodeBin) && nodeBin !== "node") {
    throw new Error(`Bundled Node missing: ${nodeBin}`);
  }

  const requestedPort = USES_EPHEMERAL_PORT ? 0 : swarmPort;
  log(
    `spawning Hyperswarm sidecar (${nodeBin}) on ${SWARM_HOST}:${requestedPort}${USES_EPHEMERAL_PORT ? " (ephemeral)" : ""}`,
  );

  const stdio = USES_EPHEMERAL_PORT
    ? /** @type {const} */ (["ignore", "inherit", "inherit", "ipc"])
    : "inherit";

  swarmChild = spawn(nodeBin, [entry], {
    stdio,
    env: {
      ...process.env,
      HOLEPUNCH_HOST: SWARM_HOST,
      HOLEPUNCH_PORT: String(requestedPort),
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

  if (USES_EPHEMERAL_PORT) {
    const listening = await waitForListeningIpc(swarmChild);
    swarmPort = listening.port;
  } else {
    const ok = await waitForPort(SWARM_HOST, swarmPort);
    if (!ok) {
      swarmChild?.kill("SIGTERM");
      swarmChild = null;
      clearTokenLock();
      throw new Error(
        `Hyperswarm bridge did not listen on ${SWARM_HOST}:${swarmPort}.\n` +
          (app.isPackaged
            ? "Packaged sidecar failed to start."
            : "Run: npm run holepunch:install"),
      );
    }
  }

  ownsSwarm = true;
  writeTokenLock(authToken);
  log(
    `owned Hyperswarm bridge ready at ${bridgeWsBase()}${USES_TOKEN_LOCK ? " (token lock written)" : ""}`,
  );
}

async function ensureLocalSwarm() {
  // Packaged (isolated): always own — never attach to a foreign bridge.
  if (app.isPackaged || isIsolated) {
    await spawnSidecar();
    return;
  }

  if (await portOpen(SWARM_HOST, swarmPort)) {
    ownsSwarm = false;
    adoptSharedToken();
    log(`attaching to existing Hyperswarm bridge at ${bridgeWsBase()}`);
    return;
  }

  try {
    await spawnSidecar();
  } catch {
    if (await waitForPort(SWARM_HOST, swarmPort, 20, 100)) {
      ownsSwarm = false;
      adoptSharedToken();
      log(`attached to peer-owned Hyperswarm bridge at ${bridgeWsBase()}`);
      return;
    }
    throw new Error(
      `Hyperswarm bridge did not listen on ${SWARM_HOST}:${swarmPort}.\n` +
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
  const partition = PARTITION;
  const ses = session.fromPartition(partition);
  const baseWs = bridgeWsBase();

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
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.setMenuBarVisibility(false);

  const desktopInfo = {
    holepunchWsUrl: baseWs,
    wsToken: authToken,
    ufwState: ufwAdvisory.state,
    ...(ROLE ? { role: ROLE } : {}),
  };
  const desktopWebContents = mainWindow.webContents;
  ipcMain.removeAllListeners(DESKTOP_INFO_CHANNEL);
  ipcMain.on(DESKTOP_INFO_CHANNEL, (event) => {
    // Only this window's own preload may read its bridge config.
    event.returnValue = event.sender === desktopWebContents ? desktopInfo : null;
  });
  mainWindow.once("closed", () => {
    ipcMain.removeAllListeners(DESKTOP_INFO_CHANNEL);
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

if (isPrimaryInstance) {
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
}