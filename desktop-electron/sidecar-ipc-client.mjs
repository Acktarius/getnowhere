/**
 * Electron main ↔ holepunch-sidecar NDJSON client over net IPC.
 * @see docs/architecture/local-bridge-transport.md
 */

import { createConnection } from "node:net";

const DEFAULT_MAX_LINE_BYTES = 262_144;

/**
 * @param {string} ipcPath
 * @param {{ retries?: number; delayMs?: number; timeoutMs?: number }} [opts]
 */
export async function connectSidecarIpc(ipcPath, opts = {}) {
  const retries = opts.retries ?? 25;
  const delayMs = opts.delayMs ?? 80;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const started = Date.now();
  let lastErr = /** @type {Error | null} */ (null);

  for (let attempt = 0; attempt < retries; attempt += 1) {
    if (Date.now() - started > timeoutMs) break;
    try {
      return await connectOnce(ipcPath);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr ?? new Error(`sidecar IPC connect failed: ${ipcPath}`);
}

/**
 * @param {string} ipcPath
 * @returns {Promise<SidecarIpcConnection>}
 */
function connectOnce(ipcPath) {
  return new Promise((resolve, reject) => {
    const socket = createConnection(ipcPath);
    socket.once("error", reject);
    socket.once("connect", () => {
      socket.off("error", reject);
      resolve(createSidecarIpcConnection(socket));
    });
  });
}

/**
 * @typedef {{
 *   send: (cmd: object) => void
 *   onEvent: (handler: (msg: object) => void) => () => void
 *   close: () => void
 * }} SidecarIpcConnection
 */

/**
 * @param {import('node:net').Socket} socket
 * @returns {SidecarIpcConnection}
 */
export function createSidecarIpcConnection(socket) {
  let buffer = "";
  /** @type {Set<(msg: object) => void>} */
  const handlers = new Set();
  let closed = false;

  function emit(msg) {
    for (const h of handlers) {
      try {
        h(msg);
      } catch {
        /* ignore renderer-facing handler errors */
      }
    }
  }

  socket.on("data", (chunk) => {
    buffer += chunk.toString();
    while (true) {
      const nl = buffer.indexOf("\n");
      if (nl === -1) {
        if (Buffer.byteLength(buffer, "utf8") > DEFAULT_MAX_LINE_BYTES) {
          buffer = "";
          socket.destroy();
        }
        break;
      }
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (!line.trim()) continue;
      try {
        emit(JSON.parse(line));
      } catch {
        /* ignore malformed lines from sidecar */
      }
    }
  });

  socket.on("close", () => {
    closed = true;
  });
  socket.on("error", () => {
    closed = true;
  });

  return {
    send(cmd) {
      if (closed || socket.destroyed) {
        throw new Error("sidecar IPC disconnected");
      }
      socket.write(`${JSON.stringify(cmd)}\n`);
    },
    onEvent(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    close() {
      closed = true;
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
    },
  };
}
