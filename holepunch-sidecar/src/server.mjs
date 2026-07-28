/**
 * WebSocket host for the Hyperswarm mesh (default ws://127.0.0.1:7901).
 * @see docs/architecture/holepunch-sidecar.md — optional GNH_SIDECAR_TOKEN auth
 */

import { WebSocketServer } from "ws";
import { startParentDeathWatch } from "./parent-death.mjs";
import { createSwarmMesh } from "./swarm.mjs";

const host = process.env.HOLEPUNCH_HOST ?? "127.0.0.1";
const port = Number(process.env.HOLEPUNCH_PORT ?? 7901);
const requiredToken = process.env.GNH_SIDECAR_TOKEN ?? "";

const mesh = createSwarmMesh({
  disableDiscovery: process.env.GNH_DISABLE_DISCOVERY === "1",
});
const wss = new WebSocketServer({ host, port });

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
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
    if (clientToken !== requiredToken) {
      ws.close(4001, "Unauthorized");
      return;
    }
  }
  /** @type {import('./swarm.mjs').LocalClient} */
  const client = {
    send: (msg) => send(ws, msg),
  };

  /** @type {Set<string>} */
  const joined = new Set();

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      send(ws, { type: "error", message: "invalid JSON" });
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
          send(ws, {
            type: "error",
            message: "join requires topicRef and roomId",
          });
          return;
        }
        await mesh.join(msg.topicRef, client);
        joined.add(msg.topicRef);
        return;
      }

      if (msg.type === "leave") {
        if (typeof msg.topicRef !== "string") {
          send(ws, { type: "error", message: "leave requires topicRef" });
          return;
        }
        await mesh.leave(msg.topicRef, client);
        joined.delete(msg.topicRef);
        return;
      }

      if (msg.type === "frame") {
        if (
          typeof msg.topicRef !== "string" ||
          typeof msg.payload !== "string"
        ) {
          send(ws, {
            type: "error",
            message: "frame requires topicRef and payload",
          });
          return;
        }
        mesh.sendFrame(client, {
          topicRef: msg.topicRef,
          roomId: msg.roomId,
          payload: msg.payload,
        });
        return;
      }

      send(ws, { type: "error", message: `unknown type: ${msg.type}` });
    } catch (e) {
      send(ws, {
        type: "error",
        message: e instanceof Error ? e.message : "sidecar error",
      });
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

startParentDeathWatch({
  intervalMs: Number(process.env.GNH_PARENT_POLL_MS ?? 1000),
  onDeath: async () => {
    console.error("[holepunch-sidecar] parent process died; exiting");
    wss.close();
    await mesh.destroy();
  },
});

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
