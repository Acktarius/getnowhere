/**
 * Pure normalization of the gnhDesktop bridge payload — no `electron`
 * import, so it is unit-testable with `node --test`.
 *
 * Sandboxed `preload.cjs` cannot `require` this file (Electron polyfill only
 * allows `electron` + a few builtins). Keep the helpers in preload.cjs in sync
 * with this module.
 * @see docs/architecture/electron-desktop.md
 * @see https://www.electronjs.org/docs/latest/tutorial/sandbox
 */

const DEFAULT_WS_URL = "ws://127.0.0.1:7901";

/**
 * @param {unknown} raw - result of `ipcRenderer.sendSync("gnh:get-desktop-info")`
 * @returns {{ holepunchWsUrl: string, wsToken: string, ufwState: "active" | "inactive" | "unknown", role?: string }}
 */
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
 * Ephemeral port + token must reach the renderer even if sync IPC races
 * about:blank — otherwise the UI reconnect-loops on :7901 with no token.
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

module.exports = {
  normalizeGnhDesktopInfo,
  resolvePreloadDesktopInfo,
  DEFAULT_WS_URL,
};
