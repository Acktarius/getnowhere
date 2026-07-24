/**
 * Expose gnhDesktop { role, holepunchWsUrl, wsToken } to the Vite renderer.
 * @see docs/architecture/electron-desktop.md
 *
 * Important: do NOT put `?token=` in --gnh-holepunch-ws — Chromium/Electron can
 * truncate additionalArguments at `?`. Pass base URL + token separately.
 */
const { contextBridge } = require("electron");

function readArg(prefix) {
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : "";
}

function buildWsUrl(base, token) {
  const clean = (base || "ws://127.0.0.1:7901").split("?")[0].trim();
  if (!token) return clean;
  return `${clean}?token=${encodeURIComponent(token)}`;
}

const role =
  readArg("--gnh-role=") || process.env.GNH_ROLE || "alice";

const wsToken =
  readArg("--gnh-ws-token=") || process.env.GNH_SIDECAR_TOKEN || "";

// Prefer CLI arg (from main) over env. Env VITE_* is for Vite only — not used here.
const baseWs =
  readArg("--gnh-holepunch-ws=") ||
  process.env.GNH_HOLEPUNCH_WS_URL ||
  "ws://127.0.0.1:7901";

const holepunchWsUrl = buildWsUrl(baseWs, wsToken);

contextBridge.exposeInMainWorld("gnhDesktop", {
  role,
  holepunchWsUrl,
  wsToken,
});
