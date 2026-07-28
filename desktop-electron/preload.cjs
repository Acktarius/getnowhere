/**
 * Expose gnhDesktop { role?, holepunchWsUrl, wsToken, ufwState } to the Vite renderer.
 * @see docs/architecture/electron-desktop.md
 *
 * Primary: `additionalArguments` (proven v0.1.6). Fallback: sync IPC
 * `gnh:get-desktop-info` so ephemeral port + token still reach the renderer.
 */
const { contextBridge, ipcRenderer } = require("electron");
const { resolvePreloadDesktopInfo } = require("./preload-bridge.cjs");

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
