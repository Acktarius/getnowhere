/**
 * NDJSON bridge over net IPC (Unix domain socket / named pipe).
 * @see docs/architecture/local-bridge-transport.md
 */

import { createServer } from "node:net";
import { config } from "./config.mjs";
import { BRIDGE_ERRORS, bridgeError } from "./errors.mjs";
import { cleanupStaleIpcPath } from "./ipc-path.mjs";
import { createBridgeSession } from "./bridge-session.mjs";

/**
 * @param {import('./swarm.mjs').ReturnType<typeof import('./swarm.mjs').createSwarmMesh>} mesh
 * @param {{
 *   path: string
 *   onListening?: (path: string) => void
 *   onClientConnected?: () => void
 * }} opts
 */
export function createIpcBridgeServer(mesh, opts) {
  const { path: ipcPath } = opts;
  cleanupStaleIpcPath(ipcPath);

  /** @type {import('node:net').Server | null} */
  let server = null;

  /**
   * @param {import('node:net').Socket} socket
   */
  function attachSocket(socket) {
    opts.onClientConnected?.();
    let buffer = "";
    let closed = false;

    /** @param {object} msg */
    function send(msg) {
      if (closed || socket.destroyed) return;
      try {
        socket.write(`${JSON.stringify(msg)}\n`);
      } catch {
        /* best-effort */
      }
    }

    /** @param {string} code @param {string} [message] */
    function sendError(code, message) {
      send(bridgeError(code, message));
    }

    /** @param {string} code @param {number} size @param {number} limit */
    function rejectOversize(code, size, limit) {
      const err = bridgeError(code);
      console.warn(
        `[holepunch-sidecar] IPC oversize: ${size} > ${limit} (${err.code})`,
      );
      sendError(code);
      endSocket();
    }

    const session = createBridgeSession(mesh, { send, sendError, rejectOversize });

    function endSocket() {
      if (closed) return;
      closed = true;
      session.close();
      try {
        socket.end();
      } catch {
        /* ignore */
      }
    }

    socket.on("data", async (chunk) => {
      buffer += chunk.toString();
      while (true) {
        const nl = buffer.indexOf("\n");
        if (nl === -1) {
          if (Buffer.byteLength(buffer, "utf8") > config.maxNdjsonLineBytes) {
            console.warn(
              `[holepunch-sidecar] IPC line cap exceeded (${config.maxNdjsonLineBytes})`,
            );
            sendError(BRIDGE_ERRORS.message_too_large.code);
            endSocket();
            buffer = "";
          }
          break;
        }
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (!line.trim()) continue;
        const keepOpen = await session.handleRawMessage(line);
        if (!keepOpen) {
          endSocket();
          return;
        }
      }
    });

    socket.on("close", () => {
      endSocket();
    });
    socket.on("error", () => {
      endSocket();
    });
  }

  server = createServer((socket) => {
    attachSocket(socket);
  });

  server.on("error", (err) => {
    console.error(`[holepunch-sidecar] IPC server error: ${err.message}`);
    process.exit(1);
  });

  return {
    listen() {
      return new Promise((resolve, reject) => {
        server?.listen(ipcPath, () => {
          console.log(`[holepunch-sidecar] listening ipc://${ipcPath}`);
          opts.onListening?.(ipcPath);
          resolve(undefined);
        });
        server?.once("error", reject);
      });
    },
    close() {
      return new Promise((resolve) => {
        if (!server) {
          resolve();
          return;
        }
        server.close(() => resolve());
      });
    },
  };
}
