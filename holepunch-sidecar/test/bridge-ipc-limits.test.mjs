/**
 * IPC auth deadline and connection cap (SEC-2026-020).
 * Not Hyperswarm holepunch — local first-line auth only.
 */

import assert from "node:assert/strict";
import { createConnection } from "node:net";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createIpcBridgeServer } from "../src/bridge-ipc.mjs";

function fakeMesh() {
  return {
    join: async () => {},
    leave: async () => {},
    sendFrame() {},
    removeClient: async () => {},
  };
}

function tempPath(name) {
  return join(tmpdir(), `gnh-ipc-lim-${name}-${process.pid}-${Date.now()}.sock`);
}

describe("IPC auth deadline and max connections", () => {
  it("closes a socket that never sends auth", async () => {
    const path = tempPath("auth-to");
    const bridge = createIpcBridgeServer(fakeMesh(), {
      path,
      token: "tok",
      authTimeoutMs: 80,
    });
    try {
      await bridge.listen();
      const closed = await new Promise((resolve, reject) => {
        const socket = createConnection(path);
        const t = setTimeout(() => reject(new Error("socket stayed open")), 1500);
        socket.once("close", () => {
          clearTimeout(t);
          resolve(true);
        });
        socket.once("error", () => {
          clearTimeout(t);
          resolve(true);
        });
      });
      assert.equal(closed, true);
    } finally {
      await bridge.close();
      if (existsSync(path)) unlinkSync(path);
    }
  });

  it("refuses a ninth concurrent IPC client", async () => {
    const path = tempPath("max-conn");
    const bridge = createIpcBridgeServer(fakeMesh(), {
      path,
      token: "tok",
      authTimeoutMs: 30_000,
      maxConnections: 8,
    });
    /** @type {import('node:net').Socket[]} */
    const sockets = [];
    try {
      await bridge.listen();
      for (let i = 0; i < 8; i++) {
        const s = await new Promise((resolve, reject) => {
          const socket = createConnection(path);
          socket.once("connect", () => resolve(socket));
          socket.once("error", reject);
        });
        sockets.push(s);
      }
      const ninthFailed = await new Promise((resolve) => {
        const socket = createConnection(path);
        let settled = false;
        const finish = (ok) => {
          if (settled) return;
          settled = true;
          clearTimeout(t);
          socket.destroy();
          resolve(ok);
        };
        const t = setTimeout(() => finish(true), 400);
        socket.once("connect", () => {
          setTimeout(() => {
            if (!socket.destroyed) finish(false);
          }, 80);
        });
        socket.once("error", () => finish(true));
        socket.once("close", () => finish(true));
      });
      assert.equal(ninthFailed, true);
    } finally {
      for (const s of sockets) s.destroy();
      await bridge.close();
      if (existsSync(path)) unlinkSync(path);
    }
  });
});
