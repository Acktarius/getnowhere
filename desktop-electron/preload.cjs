/**
 * Expose gnhDesktop { role?, holepunchWsUrl, wsToken, ufwState } to the Vite renderer.
 * @see docs/architecture/electron-desktop.md
 *
 * Pulled over a synchronous IPC round-trip to main (`gnh:get-desktop-info`)
 * instead of `additionalArguments` / `executeJavaScript`, so the auth token
 * never sits in this process's command line or in the page's main-world
 * scope. Normalization lives in preload-bridge.cjs (no electron import, so
 * it's testable) and trusts ONLY main's IPC reply — see that file for why it
 * never falls back to ambient process.env.
 */
const { contextBridge, ipcRenderer } = require("electron");
const { normalizeGnhDesktopInfo } = require("./preload-bridge.cjs");

let raw = null;
try {
  raw = ipcRenderer.sendSync("gnh:get-desktop-info");
} catch {
  /* main not ready / channel missing — normalize() falls back to defaults */
}

contextBridge.exposeInMainWorld("gnhDesktop", normalizeGnhDesktopInfo(raw));
