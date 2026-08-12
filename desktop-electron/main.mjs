/**
 * Electron shell: embedded Vite dist (packaged) or local Vite (dev) + sidecar child.
 * @see docs/architecture/electron-desktop.md
 * @see docs/builds/github-pages-and-desktop.md
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app, BrowserWindow, ipcMain, Menu, session } from "electron";
import { resolveDesktopIdentity } from "./desktop-identity.mjs";
import {
  generateSidecarIpcPath,
  sharedIpcLockBasename,
} from "./desktop-ipc-path.mjs";
import { getUfwAdvisory } from "./firewall-status.mjs";
import { connectSidecarIpc } from "./sidecar-ipc-client.mjs";

const require = createRequire(import.meta.url);
const { resolveDesktopInfoReply } = require("./desktop-info-ipc.cjs");

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
/** Native sidecar IPC unless WS URL override forces loopback WebSocket. */
const USE_SIDECAR_IPC = !BASE_WS_URL_OVERRIDE;
const SIDECAR_COMMAND_CHANNEL = "gnh:sidecar-command";
const SIDECAR_EVENT_CHANNEL = "gnh:sidecar-event";

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

/** Packaged sidecar Node binary (node.exe on Windows). */
function bundledNodeBin() {
  const base = join(process.resourcesPath, "runtime", "node");
  if (process.platform === "win32") {
    const withExe = `${base}.exe`;
    return existsSync(withExe) ? withExe : base;
  }
  return base;
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
      nodeBin: process.env.GNH_NODE_BIN ?? bundledNodeBin(),
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

function ipcLockPath() {
  return join(tmpdir(), sharedIpcLockBasename(SWARM_HOST, ROLE ?? "shared"));
}

/** @param {string} path */
function writeIpcLock(path) {
  if (!USES_TOKEN_LOCK || !USE_SIDECAR_IPC) return;
  writeFileSync(ipcLockPath(), path, { encoding: "utf8", mode: 0o600 });
}

function readIpcLock() {
  if (!USES_TOKEN_LOCK || !USE_SIDECAR_IPC) return null;
  const path = ipcLockPath();
  if (!existsSync(path)) return null;
  try {
    const value = readFileSync(path, "utf8").trim();
    return value || null;
  } catch {
    return null;
  }
}

function clearIpcLock() {
  if (!USES_TOKEN_LOCK || !USE_SIDECAR_IPC) return;
  try {
    unlinkSync(ipcLockPath());
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

/** @type {object | null} Bridge payload; ready before `new BrowserWindow`. @see docs/architecture/electron-desktop.md */
let desktopInfo = null;
/** @type {number | null} */
let allowedWebContentsId = null;
let sidecarIpcPath = "";
/** @type {import("./sidecar-ipc-client.mjs").SidecarIpcConnection | null} */
let sidecarIpcConn = null;
/** @type {(() => void) | null} */
let sidecarIpcEventOff = null;

function installDesktopInfoHandler() {
  ipcMain.removeAllListeners(DESKTOP_INFO_CHANNEL);
  ipcMain.on(DESKTOP_INFO_CHANNEL, (event) => {
    event.returnValue = resolveDesktopInfoReply({
      desktopInfo,
      allowedWebContentsId,
      senderId: event.sender.id,
    });
  });
}

/** @param {object} msg */
function forwardSidecarEvent(msg) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(SIDECAR_EVENT_CHANNEL, msg);
  }
}

function installSidecarBridgeHandlers() {
  ipcMain.removeHandler(SIDECAR_COMMAND_CHANNEL);
  ipcMain.handle(SIDECAR_COMMAND_CHANNEL, (event, cmd) => {
    if (
      allowedWebContentsId != null &&
      event.sender.id !== allowedWebContentsId
    ) {
      throw new Error("unauthorized sidecar command");
    }
    if (!sidecarIpcConn) {
      throw new Error("sidecar IPC not connected");
    }
    if (!cmd || typeof cmd !== "object" || typeof cmd.type !== "string") {
      throw new Error("invalid sidecar command");
    }
    sidecarIpcConn.send(cmd);
  });
}

/** @param {string} path */
async function attachSidecarIpc(path) {
  sidecarIpcPath = path;
  sidecarIpcConn = await connectSidecarIpc(path);
  sidecarIpcEventOff = sidecarIpcConn.onEvent(forwardSidecarEvent);
}

async function disconnectSidecarIpc() {
  sidecarIpcEventOff?.();
  sidecarIpcEventOff = null;
  sidecarIpcConn?.close();
  sidecarIpcConn = null;
}

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
 * Wait for sidecar bootstrap `{ type: "listening", … }` over Node child IPC.
 * @param {import('node:child_process').ChildProcess} child
 * @param {number} timeoutMs
 * @returns {Promise<{ transport: "ipc"; path: string } | { transport: "ws"; port: number; host: string }>}
 */
function waitForSidecarListening(child, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      cleanup();
      reject(new Error("sidecar did not report listening over IPC"));
    }, timeoutMs);

    /** @param {unknown} msg */
    function onMessage(msg) {
      if (!msg || typeof msg !== "object" || msg.type !== "listening") return;
      if (
        msg.transport === "ipc" &&
        typeof msg.path === "string" &&
        msg.path.trim()
      ) {
        cleanup();
        resolve({ transport: "ipc", path: msg.path.trim() });
        return;
      }
      if (
        (msg.transport === "ws" || msg.transport === undefined) &&
        typeof msg.port === "number" &&
        msg.port > 0
      ) {
        cleanup();
        resolve({
          transport: "ws",
          port: msg.port,
          host:
            typeof msg.host === "string" && msg.host.trim()
              ? msg.host.trim()
              : SWARM_HOST,
        });
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
  const spawnIpc = USE_SIDECAR_IPC || USES_EPHEMERAL_PORT;
  if (USE_SIDECAR_IPC) {
    sidecarIpcPath = generateSidecarIpcPath();
  }

  log(
    USE_SIDECAR_IPC
      ? `spawning Hyperswarm sidecar (${nodeBin}) ipc://${sidecarIpcPath}`
      : `spawning Hyperswarm sidecar (${nodeBin}) on ${SWARM_HOST}:${requestedPort}${USES_EPHEMERAL_PORT ? " (ephemeral)" : ""}`,
  );

  const stdio = spawnIpc
    ? /** @type {const} */ (
        app.isPackaged
          ? ["ignore", "ignore", "ignore", "ipc"]
          : ["ignore", "inherit", "inherit", "ipc"]
      )
    : "inherit";

  /** @type {Record<string, string>} */
  const childEnv = {
    ...process.env,
    HOLEPUNCH_HOST: SWARM_HOST,
    HOLEPUNCH_PORT: String(requestedPort),
  };
  if (USE_SIDECAR_IPC) {
    childEnv.GNH_BRIDGE_TRANSPORT = "ipc";
    childEnv.GNH_IPC_PATH = sidecarIpcPath;
    delete childEnv.GNH_SIDECAR_TOKEN;
  } else {
    childEnv.GNH_SIDECAR_TOKEN = authToken;
  }

  swarmChild = spawn(nodeBin, [entry], {
    stdio,
    windowsHide: true,
    env: childEnv,
    cwd,
  });

  swarmChild.on("exit", (code, signal) => {
    log(`swarm child exited code=${code} signal=${signal}`);
    swarmChild = null;
    ownsSwarm = false;
    clearTokenLock();
    clearIpcLock();
    void disconnectSidecarIpc();
  });

  if (spawnIpc) {
    const listening = await waitForSidecarListening(swarmChild);
    if (listening.transport === "ipc") {
      sidecarIpcPath = listening.path;
      await attachSidecarIpc(listening.path);
    } else {
      swarmPort = listening.port;
    }
  } else {
    const ok = await waitForPort(SWARM_HOST, swarmPort);
    if (!ok) {
      swarmChild?.kill("SIGTERM");
      swarmChild = null;
      clearTokenLock();
      clearIpcLock();
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
  writeIpcLock(sidecarIpcPath);
  log(
    USE_SIDECAR_IPC
      ? `owned Hyperswarm bridge ready at ipc://${sidecarIpcPath}${USES_TOKEN_LOCK ? " (ipc lock written)" : ""}`
      : `owned Hyperswarm bridge ready at ${bridgeWsBase()}${USES_TOKEN_LOCK ? " (token lock written)" : ""}`,
  );
}

async function ensureLocalSwarm() {
  installSidecarBridgeHandlers();

  // Packaged (isolated): always own — never attach to a foreign bridge.
  if (app.isPackaged || isIsolated) {
    await spawnSidecar();
    return;
  }

  if (USE_SIDECAR_IPC) {
    const fromLock = readIpcLock();
    if (fromLock) {
      try {
        await attachSidecarIpc(fromLock);
        ownsSwarm = false;
        adoptSharedToken();
        log(`attaching to existing Hyperswarm IPC at ${fromLock}`);
        return;
      } catch {
        /* owner may still be starting — fall through to spawn / retry */
      }
    }
  } else if (await portOpen(SWARM_HOST, swarmPort)) {
    ownsSwarm = false;
    adoptSharedToken();
    log(`attaching to existing Hyperswarm bridge at ${bridgeWsBase()}`);
    return;
  }

  try {
    await spawnSidecar();
  } catch {
    if (USE_SIDECAR_IPC) {
      const fromLock = readIpcLock();
      if (fromLock) {
        try {
          await attachSidecarIpc(fromLock);
          ownsSwarm = false;
          adoptSharedToken();
          log(`attached to peer-owned Hyperswarm IPC at ${fromLock}`);
          return;
        } catch {
          /* fall through */
        }
      }
    } else if (await waitForPort(SWARM_HOST, swarmPort, 20, 100)) {
      ownsSwarm = false;
      adoptSharedToken();
      log(`attached to peer-owned Hyperswarm bridge at ${bridgeWsBase()}`);
      return;
    }
    throw new Error(
      USE_SIDECAR_IPC
        ? "Hyperswarm sidecar IPC bridge did not become ready.\nRun: npm run holepunch:install"
        : `Hyperswarm bridge did not listen on ${SWARM_HOST}:${swarmPort}.\nRun: npm run holepunch:install`,
    );
  }
}

async function stopOwnedSwarm() {
  await disconnectSidecarIpc();
  if (!swarmChild) return;
  log("stopping owned Hyperswarm sidecar");
  const child = swarmChild;
  swarmChild = null;
  ownsSwarm = false;
  clearTokenLock();
  clearIpcLock();
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
  const useIpcBridge = USE_SIDECAR_IPC && !!sidecarIpcConn;

  const modeTag = isIsolated
    ? "isolated"
    : ownsSwarm
      ? "shared:owner"
      : "shared:attach";

  // IPC before BrowserWindow — preload may sendSync on about:blank during ctor.
  desktopInfo = useIpcBridge
    ? {
        bridgeTransport: "ipc",
        ufwState: ufwAdvisory.state,
        ...(ROLE ? { role: ROLE } : {}),
      }
    : {
        bridgeTransport: "ws",
        holepunchWsUrl: baseWs,
        wsToken: authToken,
        ufwState: ufwAdvisory.state,
        ...(ROLE ? { role: ROLE } : {}),
      };
  allowedWebContentsId = null;
  installDesktopInfoHandler();

  /** @type {string[]} */
  const argvBridge = useIpcBridge
    ? [`--gnh-bridge-transport=ipc`, `--gnh-ufw-state=${ufwAdvisory.state}`]
    : [
        `--gnh-holepunch-ws=${baseWs}`,
        `--gnh-ws-token=${authToken}`,
        `--gnh-ufw-state=${ufwAdvisory.state}`,
      ];
  if (ROLE) argvBridge.push(`--gnh-role=${ROLE}`);

  mainWindow = new BrowserWindow({
    width: 600,
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
      additionalArguments: argvBridge,
    },
  });
  allowedWebContentsId = mainWindow.webContents.id;

  Menu.setApplicationMenu(null);
  mainWindow.setMenuBarVisibility(false);

  mainWindow.once("closed", () => {
    desktopInfo = null;
    allowedWebContentsId = null;
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
  log(
    `loading UI ${uiLabel} (partition ${partition}, mode=${SWARM_MODE}, bridge ${useIpcBridge ? `ipc://${sidecarIpcPath}` : baseWs})`,
  );
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