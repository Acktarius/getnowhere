/**
 * Pure normalization of the gnhDesktop bridge payload — no `electron`
 * import, so it is unit-testable with `node --test` (preload.cjs itself
 * cannot be, same reason main.mjs needs desktop-identity.mjs extracted).
 *
 * Takes whatever main.mjs returned over the `gnh:get-desktop-info` sync IPC
 * channel and validates its shape before it's exposed to the renderer.
 * Deliberately never reads `process.env`: main.mjs is the single place that
 * knows `app.isPackaged`, and the previous argv-based delivery already
 * showed that any independent fallback here can leak a leftover dev-harness
 * value into a packaged build.
 * @see docs/architecture/electron-desktop.md
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

module.exports = { normalizeGnhDesktopInfo, DEFAULT_WS_URL };
