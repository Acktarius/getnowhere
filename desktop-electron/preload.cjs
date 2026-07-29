/**
 * Expose gnhDesktop { role?, holepunchWsUrl, wsToken, ufwState } to the Vite renderer.
 * @see docs/architecture/electron-desktop.md
 *
 * Sandboxed preload may only `require("electron")` (and a few Node builtins) —
 * NOT local files. Keep this file self-contained; mirror pure helpers in
 * preload-bridge.cjs for `node --test`.
 * @see https://www.electronjs.org/docs/latest/tutorial/sandbox
 *
 * Primary: `additionalArguments` (proven v0.1.6). Fallback: sync IPC
 * `gnh:get-desktop-info` so ephemeral port + token still reach the renderer.
 */
const { contextBridge, ipcRenderer } = require("electron");

const DEFAULT_WS_URL = "ws://127.0.0.1:7901";

function readArg(prefix) {
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : "";
}

function argvDesktopInfo() {
  const holepunchWsUrl = readArg("--gnh-holepunch-ws=");
  const wsToken = readArg("--gnh-ws-token=");
  const ufwState = readArg("--gnh-ufw-state=");
  const role = readArg("--gnh-role=");
  if (!holepunchWsUrl && !wsToken) return null;
  return {
    ...(holepunchWsUrl ? { holepunchWsUrl } : {}),
    ...(wsToken ? { wsToken } : {}),
    ...(ufwState ? { ufwState } : {}),
    ...(role ? { role } : {}),
  };
}

/** @param {unknown} raw */
function normalizeGnhDesktopInfo(raw) {
  const info = raw && typeof raw === "object" ? raw : {};

  const holepunchWsUrl =
    typeof info.holepunchWsUrl === "string" && info.holepunchWsUrl.trim()
      ? info.holepunchWsUrl.trim()
      : DEFAULT_WS_URL;
  const wsToken = typeof info.wsToken === "string" ? info.wsToken : "";
  const ufwState =
    info.ufwState === "active" || info.ufwState === "inactive"
      ? info.ufwState
      : "unknown";

  /** @type {{ holepunchWsUrl: string, wsToken: string, ufwState: string, role?: string }} */
  const bridge = { holepunchWsUrl, wsToken, ufwState };
  if (typeof info.role === "string" && info.role) {
    bridge.role = info.role;
  }
  return bridge;
}

/**
 * Prefer argv from main's `additionalArguments` (proven in v0.1.6), then IPC.
 * @param {unknown} ipcRaw
 * @param {unknown} argvRaw
 */
function resolvePreloadDesktopInfo(ipcRaw, argvRaw) {
  const argvInfo = argvRaw && typeof argvRaw === "object" ? argvRaw : null;
  const argvUrl =
    typeof argvInfo?.holepunchWsUrl === "string"
      ? argvInfo.holepunchWsUrl.trim()
      : "";
  if (argvUrl) return normalizeGnhDesktopInfo(argvInfo);
  return normalizeGnhDesktopInfo(ipcRaw);
}

let ipcRaw = null;
try {
  ipcRaw = ipcRenderer.sendSync("gnh:get-desktop-info");
} catch {
  /* main not ready / channel missing */
}

contextBridge.exposeInMainWorld(
  "gnhDesktop",
  resolvePreloadDesktopInfo(ipcRaw, argvDesktopInfo()),
);
