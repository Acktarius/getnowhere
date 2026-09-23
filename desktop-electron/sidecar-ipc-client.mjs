/**
 * Electron main ↔ holepunch-sidecar NDJSON client over net IPC.
 * First line is `{ type: "auth", token }`; commands wait for `auth-ok`.
 * @see docs/architecture/local-bridge-transport.md
 */

import { createConnection } from "node:net";

const DEFAULT_MAX_LINE_BYTES = 262_144;

/**
 * @param {string} ipcPath
 * @param {{ token: string; retries?: number; delayMs?: number; timeoutMs?: number }} [opts]
 */
export async function connectSidecarIpc(ipcPath, opts = {}) {
  const token = opts.token;
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("sidecar IPC token required");
  }
  const retries = opts.retries ?? 25;
  const delayMs = opts.delayMs ?? 80;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const started = Date.now();
  let lastErr = /** @type {Error | null} */ (null);

  for (let attempt = 0; attempt < retries; attempt += 1) {
    if (Date.now() - started > timeoutMs) break;
    try {
      const conn = await connectOnce(ipcPath);
      try {
        await conn.authenticate(token);
      } catch (e) {
        conn.close();
        throw e;
      }
      return conn;
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
 *   authenticate: (token: string) => Promise<void>
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
  let authenticated = false;
  /** @type {((err?: Error) => void) | null} */
  let authSettle = null;

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
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (!authenticated) {
        if (msg?.type === "auth-ok" && authSettle) {
          authenticated = true;
          const settle = authSettle;
          authSettle = null;
          settle();
        }
        continue;
      }
      emit(msg);
    }
  });

  function failAuth(err) {
    if (!authSettle) return;
    const settle = authSettle;
    authSettle = null;
    settle(err);
  }

  socket.on("close", () => {
    closed = true;
    failAuth(new Error("sidecar IPC closed during auth"));
    if (authenticated) {
      emit({
        type: "error",
        code: "sidecar_error",
        message: "sidecar IPC disconnected",
      });
    }
  });
  socket.on("error", () => {
    closed = true;
    failAuth(new Error("sidecar IPC auth failed"));
  });

  return {
    authenticate(token) {
      if (authenticated) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          failAuth(new Error("sidecar IPC auth timed out"));
        }, 5000);
        authSettle = (err) => {
          clearTimeout(timer);
          if (err) reject(err);
          else resolve();
        };
        socket.write(`${JSON.stringify({ type: "auth", token })}\n`);
      });
    },
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
