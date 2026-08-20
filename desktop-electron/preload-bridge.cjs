/**
 * Pure normalization of the gnhDesktop bridge payload — no `electron`
 * import, so it is unit-testable with `node --test`.
 *
 * Sandboxed `preload.cjs` cannot `require` this file (Electron polyfill only
 * allows `electron` + a few builtins). Keep the helpers in preload.cjs in sync
 * with this module.
 * @see docs/architecture/electron-desktop.md
 */

const DEFAULT_WS_URL = "ws://127.0.0.1:7901";

/**
 * @param {unknown} raw
 * @returns {{
 *   bridgeTransport: "ipc" | "ws"
 *   holepunchWsUrl?: string
 *   wsToken?: string
 *   ufwState: "active" | "inactive" | "unknown"
 *   role?: string
 * }}
 */
function normalizeGnhDesktopInfo(raw) {
  const info = raw && typeof raw === "object" ? raw : {};
  const bridgeTransport =
    info.bridgeTransport === "ipc" || info.bridgeTransport === "ws"
      ? info.bridgeTransport
      : "ws";

  const ufwState =
    info.ufwState === "active" || info.ufwState === "inactive"
      ? info.ufwState
      : "unknown";

  /** @type {ReturnType<typeof normalizeGnhDesktopInfo>} */
  const bridge = { bridgeTransport, ufwState };

  if (typeof info.role === "string" && info.role) {
    bridge.role = info.role;
  }

  if (bridgeTransport === "ipc") {
    return bridge;
  }

  bridge.holepunchWsUrl =
    typeof info.holepunchWsUrl === "string" && info.holepunchWsUrl.trim()
      ? info.holepunchWsUrl.trim()
      : DEFAULT_WS_URL;
  bridge.wsToken = typeof info.wsToken === "string" ? info.wsToken : "";
  return bridge;
}

/**
 * Prefer argv from main's `additionalArguments` (proven in v0.1.6), then IPC.
 * @param {unknown} ipcRaw
 * @param {unknown} argvRaw
 */
function resolvePreloadDesktopInfo(ipcRaw, argvRaw) {
  const argvInfo = argvRaw && typeof argvRaw === "object" ? argvRaw : null;
  const argvTransport =
    argvInfo?.bridgeTransport === "ipc" || argvInfo?.bridgeTransport === "ws"
      ? argvInfo.bridgeTransport
      : null;
  const argvUrl =
    typeof argvInfo?.holepunchWsUrl === "string"
      ? argvInfo.holepunchWsUrl.trim()
      : "";
  if (argvTransport === "ipc" || argvUrl) {
    return normalizeGnhDesktopInfo(argvInfo);
  }
  return normalizeGnhDesktopInfo(ipcRaw);
}

/**
 * @param {ReturnType<typeof normalizeGnhDesktopInfo>} info
 * @param {{
 *   sendCommand: (cmd: object) => void
 *   onBridgeEvent: (handler: (msg: object) => void) => () => void
 * }} ipcApi
 */
function exposeGnhDesktopBridge(info, ipcApi) {
  if (info.bridgeTransport === "ipc") {
    return {
      bridgeTransport: "ipc",
      ufwState: info.ufwState,
      ...(info.role ? { role: info.role } : {}),
      sendCommand: ipcApi.sendCommand,
      onBridgeEvent: ipcApi.onBridgeEvent,
    };
  }
  return {
    bridgeTransport: "ws",
    holepunchWsUrl: info.holepunchWsUrl ?? DEFAULT_WS_URL,
    wsToken: info.wsToken ?? "",
    ufwState: info.ufwState,
    ...(info.role ? { role: info.role } : {}),
  };
}

module.exports = {
  normalizeGnhDesktopInfo,
  resolvePreloadDesktopInfo,
  exposeGnhDesktopBridge,
  DEFAULT_WS_URL,
};
