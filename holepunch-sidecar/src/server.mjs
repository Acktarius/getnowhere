/**
 * WebSocket host for the Hyperswarm mesh (default ws://127.0.0.1:7901).
 * @see docs/architecture/holepunch-sidecar.md — Sidecar WS auth (token required off loopback)
 */

import { WebSocketServer } from "ws";
import { isLoopbackHost, tokensEqual } from "./auth.mjs";
import { config } from "./config.mjs";
import { BRIDGE_ERRORS, bridgeError } from "./errors.mjs";
import { isPidAlive, startParentDeathWatch } from "./parent-death.mjs";
import { createSwarmMesh } from "./swarm.mjs";

const host = process.env.HOLEPUNCH_HOST ?? "127.0.0.1";
const port = Number(process.env.HOLEPUNCH_PORT ?? 7901);
const requiredToken = process.env.GNH_SIDECAR_TOKEN ?? "";

if (!isLoopbackHost(host) && !requiredToken) {
  console.error(
    "[holepunch-sidecar] non-loopback bind requires GNH_SIDECAR_TOKEN",
  );
  process.exit(1);
}

const mesh = createSwarmMesh({
  disableDiscovery: process.env.GNH_DISABLE_DISCOVERY === "1",
});
const wss = new WebSocketServer({
  host,
  port,
  maxPayload: config.maxWsMessageBytes,
});

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

/** @param {import('ws').WebSocket} ws @param {string} code @param {string} [message] */
function sendError(ws, code, message) {
  send(ws, bridgeError(code, message));
}

/**
 * Best-effort coded error then close 1009.
 * Marks the socket so library maxPayload close does not double-notify.
 * @see openspec/changes/ws-message-size-limit
 */
function rejectOversize(ws, code, size, limit) {
  const err = bridgeError(code);
  console.warn(
    `[holepunch-sidecar] WS oversize: ${size} > ${limit} (${err.code})`,
  );
  ws._gnhSizeRejected = true;
  try {
    send(ws, err);
  } catch {
    /* best-effort */
  }
  try {
    ws.close(1009, err.message);
  } catch {
    /* best-effort */
  }
}

function announceListening(boundHost, boundPort) {
  console.log(`[holepunch-sidecar] listening ws://${boundHost}:${boundPort}`);
  if (typeof process.send === "function") {
    process.send({
      type: "listening",
      host: boundHost,
      port: boundPort,
    });
  }
}

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
  /** @type {import('./swarm.mjs').LocalClient} */
  const client = {
    send: (msg) => send(ws, msg),
  };

  /** @type {Set<string>} */
  const joined = new Set();

  // ws maxPayload closes with 1009 before 'message'; still emit typed error.
  const origClose = ws.close.bind(ws);
  ws.close = (code, reason) => {
    if (code === 1009 && ws.readyState === ws.OPEN && !ws._gnhSizeRejected) {
      ws._gnhSizeRejected = true;
      console.warn(
        `[holepunch-sidecar] WS oversize: transport maxPayload (${config.maxWsMessageBytes})`,
      );
      try {
        sendError(ws, BRIDGE_ERRORS.message_too_large.code);
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
    const rawBytes = Buffer.isBuffer(raw)
      ? raw.length
      : Buffer.byteLength(String(raw));
    if (rawBytes > config.maxWsMessageBytes) {
      rejectOversize(
        ws,
        BRIDGE_ERRORS.message_too_large.code,
        rawBytes,
        config.maxWsMessageBytes,
      );
      return;
    }

    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      sendError(ws, BRIDGE_ERRORS.invalid_json.code);
      return;
    }

    try {
      if (msg.type === "ping") {
        send(ws, { type: "pong" });
        return;
      }

      if (msg.type === "join") {
        if (
          typeof msg.topicRef !== "string" ||
          typeof msg.roomId !== "string"
        ) {
          sendError(ws, BRIDGE_ERRORS.join_requires_fields.code);
          return;
        }
        const topicRef = msg.topicRef.toLowerCase();
        await mesh.join(topicRef, client);
        joined.add(topicRef);
        return;
      }

      if (msg.type === "leave") {
        if (typeof msg.topicRef !== "string") {
          sendError(ws, BRIDGE_ERRORS.leave_requires_topic.code);
          return;
        }
        const topicRef = msg.topicRef.toLowerCase();
        await mesh.leave(topicRef, client);
        joined.delete(topicRef);
        return;
      }

      if (msg.type === "frame") {
        if (
          typeof msg.topicRef !== "string" ||
          typeof msg.payload !== "string"
        ) {
          sendError(ws, BRIDGE_ERRORS.frame_requires_fields.code);
          return;
        }
        const topicRef = msg.topicRef.toLowerCase();
        if (!joined.has(topicRef)) {
          sendError(ws, BRIDGE_ERRORS.frame_requires_join.code);
          return;
        }
        const payloadBytes = Buffer.byteLength(msg.payload, "utf8");
        if (payloadBytes > config.maxFramePayloadBytes) {
          rejectOversize(
            ws,
            BRIDGE_ERRORS.payload_too_large.code,
            payloadBytes,
            config.maxFramePayloadBytes,
          );
          return;
        }
        mesh.sendFrame(client, {
          topicRef,
          roomId: msg.roomId,
          payload: msg.payload,
        });
        return;
      }

      sendError(
        ws,
        BRIDGE_ERRORS.unknown_type.code,
        `unknown type: ${msg.type}`,
      );
    } catch (e) {
      sendError(
        ws,
        BRIDGE_ERRORS.sidecar_error.code,
        e instanceof Error ? e.message : undefined,
      );
    }
  });

  ws.on("close", () => {
    void mesh.removeClient(client);
    joined.clear();
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
  announceListening(boundHost === "::" ? host : boundHost, boundPort);
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

async function shutdown() {
  console.log("[holepunch-sidecar] shutting down");
  wss.close();
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
      wss.close();
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
