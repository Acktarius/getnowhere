/**
 * WebSocket or IPC host for the Hyperswarm mesh (default ws://127.0.0.1:7901).
 * @see docs/architecture/holepunch-sidecar.md
 */

import { WebSocketServer } from "ws";
import { isLoopbackHost, tokensEqual } from "./auth.mjs";
import { createIpcBridgeServer } from "./bridge-ipc.mjs";
import { createBridgeSession } from "./bridge-session.mjs";
import { config } from "./config.mjs";
import { BRIDGE_ERRORS, bridgeError } from "./errors.mjs";
import { isPidAlive, startParentDeathWatch } from "./parent-death.mjs";
import { createSwarmMesh } from "./swarm.mjs";

const bridgeTransport = (
  process.env.GNH_BRIDGE_TRANSPORT ?? "ws"
).toLowerCase();
const ipcPath = process.env.GNH_IPC_PATH?.trim() ?? "";
const host = process.env.HOLEPUNCH_HOST ?? "127.0.0.1";
const port = Number(process.env.HOLEPUNCH_PORT ?? 7901);
const requiredToken = process.env.GNH_SIDECAR_TOKEN ?? "";

if (bridgeTransport === "ipc") {
  if (!ipcPath) {
    console.error("[holepunch-sidecar] GNH_BRIDGE_TRANSPORT=ipc requires GNH_IPC_PATH");
    process.exit(1);
  }
} else if (bridgeTransport !== "ws") {
  console.error(
    `[holepunch-sidecar] unknown GNH_BRIDGE_TRANSPORT=${bridgeTransport}`,
  );
  process.exit(1);
} else if (!isLoopbackHost(host) && !requiredToken) {
  console.error(
    "[holepunch-sidecar] non-loopback bind requires GNH_SIDECAR_TOKEN",
  );
  process.exit(1);
}

const mesh = createSwarmMesh({
  disableDiscovery: process.env.GNH_DISABLE_DISCOVERY === "1",
});

/** @type {WebSocketServer | null} */
let wss = null;
/** @type {ReturnType<typeof createIpcBridgeServer> | null} */
let ipcServer = null;

function announceWsListening(boundHost, boundPort) {
  console.log(`[holepunch-sidecar] listening ws://${boundHost}:${boundPort}`);
  if (typeof process.send === "function") {
    process.send({
      type: "listening",
      transport: "ws",
      host: boundHost,
      port: boundPort,
    });
  }
}

/** @param {string} path */
function announceIpcListening(path) {
  if (typeof process.send === "function") {
    process.send({
      type: "listening",
      transport: "ipc",
      path,
    });
  }
}

/** @param {import('ws').WebSocket} ws @param {object} msg */
function sendWs(ws, msg) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

/** @param {import('ws').WebSocket} ws @param {string} code @param {string} [message] */
function sendWsError(ws, code, message) {
  sendWs(ws, bridgeError(code, message));
}

/**
 * @param {import('ws').WebSocket} ws
 * @param {string} code
 * @param {number} size
 * @param {number} limit
 */
function rejectWsOversize(ws, code, size, limit) {
  const err = bridgeError(code);
  console.warn(
    `[holepunch-sidecar] WS oversize: ${size} > ${limit} (${err.code})`,
  );
  ws._gnhSizeRejected = true;
  try {
    sendWsError(ws, code);
  } catch {
    /* best-effort */
  }
  try {
    ws.close(1009, err.message);
  } catch {
    /* best-effort */
  }
}

function startWebSocketServer() {
  wss = new WebSocketServer({
    host,
    port,
    maxPayload: config.maxWsMessageBytes,
  });

  wss.on("connection", (ws, req) => {
    if (requiredToken) {
      let clientToken = "";
      try {
        const url = new URL(req.url, `ws://${req.headers.host ?? "localhost"}`);
        clientToken = url.searchParams.get("token") ?? "";
      } catch {
        /* malformed URL → reject */
      }
      if (!tokensEqual(clientToken, requiredToken)) {
        console.warn("[holepunch-sidecar] WS rejected: bad or missing token");
        ws.close(4001, "Unauthorized");
        return;
      }
    }
    console.log("[holepunch-sidecar] WS client connected");

    const session = createBridgeSession(mesh, {
      send: (msg) => sendWs(ws, msg),
      sendError: (code, message) => sendWsError(ws, code, message),
      rejectOversize: (code, size, limit) =>
        rejectWsOversize(ws, code, size, limit),
    });

    const origClose = ws.close.bind(ws);
    ws.close = (code, reason) => {
      if (code === 1009 && ws.readyState === ws.OPEN && !ws._gnhSizeRejected) {
        ws._gnhSizeRejected = true;
        console.warn(
          `[holepunch-sidecar] WS oversize: transport maxPayload (${config.maxWsMessageBytes})`,
        );
        try {
          sendWsError(ws, BRIDGE_ERRORS.message_too_large.code);
        } catch {
          /* best-effort */
        }
      }
      return origClose(code, reason);
    };
    ws.on("error", () => {
      /* maxPayload / transport errors; close path handles client notify */
    });

    ws.on("message", async (raw) => {
      const keepOpen = await session.handleRawMessage(raw);
      if (!keepOpen) {
        try {
          ws.close(1009, "message too large");
        } catch {
          /* ignore */
        }
      }
    });

    ws.on("close", () => {
      session.close();
    });
  });

  wss.on("listening", () => {
    const addr = wss.address();
    const boundPort =
      typeof addr === "object" && addr && "port" in addr ? addr.port : port;
    const boundHost =
      typeof addr === "object" && addr && "address" in addr
        ? addr.address
        : host;
    announceWsListening(boundHost === "::" ? host : boundHost, boundPort);
  });

  wss.on("error", (err) => {
    const code = /** @type {NodeJS.ErrnoException} */ (err).code;
    if (code === "EADDRINUSE") {
      console.error(
        `[holepunch-sidecar] address already in use: ${host}:${port}`,
      );
    } else {
      console.error(`[holepunch-sidecar] server error: ${err.message}`);
    }
    process.exit(1);
  });
}

async function startIpcServer() {
  ipcServer = createIpcBridgeServer(mesh, {
    path: ipcPath,
    onListening: (path) => {
      announceIpcListening(path);
    },
    onClientConnected: () => {
      console.log("[holepunch-sidecar] IPC client connected");
    },
  });
  await ipcServer.listen();
}

if (bridgeTransport === "ipc") {
  void startIpcServer();
} else {
  startWebSocketServer();
}

async function shutdown() {
  console.log("[holepunch-sidecar] shutting down");
  if (wss) wss.close();
  if (ipcServer) await ipcServer.close();
  await mesh.destroy();
  process.exit(0);
}

if (process.env.GNH_DISABLE_PARENT_DEATH === "1") {
  console.log("[holepunch-sidecar] parent-death watch disabled");
} else {
  startParentDeathWatch({
    intervalMs: Number(process.env.GNH_PARENT_POLL_MS ?? 1000),
    onSkip: (reason) => {
      console.warn(`[holepunch-sidecar] parent-death watch skipped: ${reason}`);
    },
    onDeath: async () => {
      console.error(
        `[holepunch-sidecar] parent process died (was ppid=${process.ppid}); exiting`,
      );
      if (wss) wss.close();
      if (ipcServer) await ipcServer.close();
      await mesh.destroy();
    },
  });
  if (isPidAlive(process.ppid)) {
    console.log(
      `[holepunch-sidecar] parent-death watch on ppid=${process.ppid}`,
    );
  }
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
