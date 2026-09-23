/**
 * NDJSON bridge over net IPC (Unix domain socket / named pipe).
 * @see docs/architecture/local-bridge-transport.md
 */

import { chmodSync } from "node:fs";
import { createServer } from "node:net";
import { tokensEqual } from "./auth.mjs";
import { createBridgeSession } from "./bridge-session.mjs";
import { config } from "./config.mjs";
import { BRIDGE_ERRORS, bridgeError } from "./errors.mjs";
import { cleanupStaleIpcPath } from "./ipc-path.mjs";

/**
 * First NDJSON line must be `{ type: "auth", token }` before any bridge command.
 * @param {import('./swarm.mjs').ReturnType<typeof import('./swarm.mjs').createSwarmMesh>} mesh
 * @see docs/architecture/local-bridge-transport.md
 * @param {{
 *   path: string
 *   token: string
 *   onListening?: (path: string) => void
 *   onClientConnected?: () => void
 * }} opts
 */
export function createIpcBridgeServer(mesh, opts) {
  const { path: ipcPath, token } = opts;
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("ipc bridge requires a token");
  }
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
    let authed = false;

    /**
     * @param {string} line
     * @returns {boolean}
     */
    function authLineOk(line) {
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return false;
      }
      return (
        !!msg &&
        msg.type === "auth" &&
        typeof msg.token === "string" &&
        tokensEqual(msg.token, token)
      );
    }

    /**
     * @param {string} line
     * @returns {boolean}
     */
    function isAuthLine(line) {
      try {
        return JSON.parse(line)?.type === "auth";
      } catch {
        return false;
      }
    }

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
        if (!authed) {
          if (!authLineOk(line)) {
            console.warn("[holepunch-sidecar] IPC rejected: bad or missing token");
            endSocket();
            return;
          }
          authed = true;
          send({ type: "auth-ok" });
          continue;
        }
        if (isAuthLine(line)) {
          console.warn("[holepunch-sidecar] IPC rejected: repeated auth");
          endSocket();
          return;
        }
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
        // umask makes the bind itself 0600; chmod covers a deferred bind.
        const prevUmask =
          process.platform === "win32" ? null : process.umask(0o177);
        try {
          server?.listen(ipcPath, () => {
            if (process.platform !== "win32") {
              chmodSync(ipcPath, 0o600);
            }
            console.log(`[holepunch-sidecar] listening ipc://${ipcPath}`);
            opts.onListening?.(ipcPath);
            resolve(undefined);
          });
          server?.once("error", reject);
        } finally {
          if (prevUmask !== null) process.umask(prevUmask);
        }
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
