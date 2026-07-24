/**
 * WebSocket host for the Hyperswarm mesh (default ws://127.0.0.1:7901).
 * @see docs/architecture/holepunch-sidecar.md — optional GNH_SIDECAR_TOKEN auth
 */

import { WebSocketServer } from "ws";
import { createSwarmMesh } from "./swarm.mjs";

const host = process.env.HOLEPUNCH_HOST ?? "127.0.0.1";
const port = Number(process.env.HOLEPUNCH_PORT ?? 7901);
const requiredToken = process.env.GNH_SIDECAR_TOKEN ?? "";

const mesh = createSwarmMesh();
const wss = new WebSocketServer({ host, port });

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
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
  console.log(`[holepunch-sidecar] listening ws://${host}:${port}`);
});

async function shutdown() {
  console.log("[holepunch-sidecar] shutting down");
  wss.close();
  await mesh.destroy();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
