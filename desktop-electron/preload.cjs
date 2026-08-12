/**
 * Expose gnhDesktop bridge to the Vite renderer (WS or native IPC).
 * @see docs/architecture/electron-desktop.md
 */
const { contextBridge, ipcRenderer } = require("electron");

const SIDECAR_COMMAND_CHANNEL = "gnh:sidecar-command";
const SIDECAR_EVENT_CHANNEL = "gnh:sidecar-event";

const DEFAULT_WS_URL = "ws://127.0.0.1:7901";

function readArg(prefix) {
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : "";
}

function argvDesktopInfo() {
  const bridgeTransport = readArg("--gnh-bridge-transport=");
  const holepunchWsUrl = readArg("--gnh-holepunch-ws=");
  const wsToken = readArg("--gnh-ws-token=");
  const ufwState = readArg("--gnh-ufw-state=");
  const role = readArg("--gnh-role=");
  if (bridgeTransport === "ipc") {
    return {
      bridgeTransport: "ipc",
      ...(ufwState ? { ufwState } : {}),
      ...(role ? { role } : {}),
    };
  }
  if (!holepunchWsUrl && !wsToken) return null;
  return {
    bridgeTransport: "ws",
    ...(holepunchWsUrl ? { holepunchWsUrl } : {}),
    ...(wsToken ? { wsToken } : {}),
    ...(ufwState ? { ufwState } : {}),
    ...(role ? { role } : {}),
  };
}

/** @param {unknown} raw */
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
  /** @type {Record<string, unknown>} */
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

/** @param {unknown} ipcRaw @param {unknown} argvRaw */
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

function createSidecarIpcApi() {
  /** @type {Array<(msg: object) => void>} */
  const handlers = [];
  ipcRenderer.on(SIDECAR_EVENT_CHANNEL, (_event, msg) => {
    if (!msg || typeof msg !== "object") return;
    for (const handler of handlers) {
      try {
        handler(msg);
      } catch {
        /* ignore */
      }
    }
  });
  return {
    sendCommand(cmd) {
      void ipcRenderer.invoke(SIDECAR_COMMAND_CHANNEL, cmd);
    },
    onBridgeEvent(handler) {
      handlers.push(handler);
      return () => {
        const index = handlers.indexOf(handler);
        if (index >= 0) handlers.splice(index, 1);
      };
    },
  };
}

/** @param {ReturnType<typeof normalizeGnhDesktopInfo>} info */
function buildExposedBridge(info) {
  if (info.bridgeTransport === "ipc") {
    const ipcApi = createSidecarIpcApi();
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

let ipcRaw = null;
try {
  ipcRaw = ipcRenderer.sendSync("gnh:get-desktop-info");
} catch {
  /* main not ready / channel missing */
}

contextBridge.exposeInMainWorld(
  "gnhDesktop",
  buildExposedBridge(
    resolvePreloadDesktopInfo(ipcRaw, argvDesktopInfo()),
  ),
);
