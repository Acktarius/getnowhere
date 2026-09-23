/**
 * IPC bridge transport (GNH_BRIDGE_TRANSPORT=ipc).
 * @see openspec/changes/archive/2026-08-12-electron-ipc-sidecar
 */

import assert from "node:assert/strict";
import { createConnection } from "node:net";
import { spawn } from "node:child_process";
import { existsSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { config } from "../src/config.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const serverEntry = join(root, "..", "src", "server.mjs");
const IPC_TOKEN = "ipc-bridge-test-token";

/**
 * @param {Record<string, string>} env
 * @param {{ ipc?: boolean }} [opts]
 */
function spawnSidecar(env, opts = {}) {
  const stdio = opts.ipc
    ? /** @type {const} */ (["ignore", "pipe", "pipe", "ipc"])
    : /** @type {const} */ (["ignore", "pipe", "pipe"]);
  return spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      GNH_DISABLE_DISCOVERY: "1",
      GNH_DISABLE_PARENT_DEATH: "1",
      ...env,
    },
    stdio,
  });
}

/** @param {import('node:child_process').ChildProcess} child */
async function stopChild(child) {
  try {
    child.kill("SIGTERM");
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }
  await new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve(undefined);
      return;
    }
    const t = setTimeout(resolve, 2000);
    child.once("exit", () => {
      clearTimeout(t);
      resolve(undefined);
    });
  });
}

function tempIpcPath(name) {
  return join(tmpdir(), `gnh-test-${name}-${process.pid}-${Date.now()}.sock`);
}

/**
 * Register the listening waiter before the token so the announce cannot be missed.
 * @param {string} path
 */
function spawnAuthedIpc(path) {
  const child = spawnSidecar(
    {
      GNH_BRIDGE_TRANSPORT: "ipc",
      GNH_IPC_PATH: path,
    },
    { ipc: true },
  );
  const pending = waitIpcListening(child);
  child.send({ type: "ipc-auth-token", token: IPC_TOKEN });
  return { child, pending };
}

/**
 * @param {import('node:child_process').ChildProcess} child
 * @returns {Promise<{ transport: "ipc"; path: string }>}
 */
function waitIpcListening(child) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error("timeout waiting for IPC listening message"));
    }, 8000);
    child.on("message", (m) => {
      if (
        m &&
        typeof m === "object" &&
        /** @type {{ type?: string }} */ (m).type === "listening" &&
        /** @type {{ transport?: string }} */ (m).transport === "ipc" &&
        typeof /** @type {{ path?: unknown }} */ (m).path === "string"
      ) {
        clearTimeout(t);
        resolve({
          transport: "ipc",
          path: /** @type {{ path: string }} */ (m).path,
        });
      }
    });
    child.on("exit", (code) => {
      clearTimeout(t);
      reject(new Error(`sidecar exited early code=${code}`));
    });
    child.on("error", (err) => {
      clearTimeout(t);
      reject(err);
    });
  });
}

/**
 * @param {string} ipcPath
 * @param {string | null} [token] null skips the auth line
 */
function connectIpcClient(ipcPath, token = IPC_TOKEN) {
  return new Promise((resolve, reject) => {
    const socket = createConnection(ipcPath);
    let buffer = "";
    /** @type {Array<(line: string) => void>} */
    const waiters = [];
    const closed = new Promise((res) => {
      socket.on("close", () => res(undefined));
    });

    function flushLine(line) {
      const w = waiters.shift();
      if (w) w(line);
    }

    const client = {
      closed,
      send(obj) {
        socket.write(`${JSON.stringify(obj)}\n`);
      },
      nextLine() {
        return new Promise((res, rej) => {
          const nl = buffer.indexOf("\n");
          if (nl >= 0) {
            const line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            res(line);
            return;
          }
          waiters.push(res);
          socket.once("error", rej);
        });
      },
      close() {
        socket.destroy();
      },
    };

    socket.on("connect", () => {
      if (!token) {
        resolve(client);
        return;
      }
      client.send({ type: "auth", token });
      client
        .nextLine()
        .then((line) => {
          const msg = JSON.parse(line);
          if (msg.type !== "auth-ok") {
            reject(new Error(`expected auth-ok, got ${line}`));
            return;
          }
          resolve(client);
        })
        .catch(reject);
    });
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      while (true) {
        const nl = buffer.indexOf("\n");
        if (nl === -1) break;
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        flushLine(line);
      }
    });
    socket.on("error", reject);
  });
}

describe("sidecar IPC bridge transport", () => {
  it("announces { transport: ipc, path } over Node child IPC", async () => {
    const path = tempIpcPath("listen");
    const { child, pending } = spawnAuthedIpc(path);

    const msg = await pending;
    assert.equal(msg.transport, "ipc");
    assert.equal(msg.path, path);
    if (process.platform !== "win32") {
      assert.equal(statSync(path).mode & 0o777, 0o600);
    }

    await stopChild(child);
    if (existsSync(path)) unlinkSync(path);
  });

  it("does not listen until the parent sends the auth token", async () => {
    const path = tempIpcPath("wait-token");
    const child = spawnSidecar(
      {
        GNH_BRIDGE_TRANSPORT: "ipc",
        GNH_IPC_PATH: path,
      },
      { ipc: true },
    );
    const deadline = Date.now() + 2500;
    let connectedEarly = false;
    while (Date.now() < deadline) {
      connectedEarly = await new Promise((resolve) => {
        const socket = createConnection(path);
        const finish = (ok) => {
          socket.destroy();
          resolve(ok);
        };
        socket.once("connect", () => finish(true));
        socket.once("error", () => finish(false));
        setTimeout(() => finish(false), 80);
      });
      if (connectedEarly) break;
    }
    assert.equal(connectedEarly, false);

    const pending = waitIpcListening(child);
    child.send({ type: "ipc-auth-token", token: IPC_TOKEN });
    const msg = await pending;
    assert.equal(msg.path, path);

    await stopChild(child);
    if (existsSync(path)) unlinkSync(path);
  });

  it("round-trips ping/pong over NDJSON", async () => {
    const path = tempIpcPath("ping");
    const { child, pending } = spawnAuthedIpc(path);
    const { path: boundPath } = await pending;
    const client = await connectIpcClient(boundPath);
    client.send({ type: "ping" });
    const line = await client.nextLine();
    const msg = JSON.parse(line);
    assert.equal(msg.type, "pong");
    client.close();

    await stopChild(child);
    if (existsSync(path)) unlinkSync(path);
  });

  it("rejects a command before auth", async () => {
    const path = tempIpcPath("no-auth");
    const { child, pending } = spawnAuthedIpc(path);
    const { path: boundPath } = await pending;
    const client = await connectIpcClient(boundPath, null);
    client.send({ type: "ping" });
    await client.closed;

    await stopChild(child);
    if (existsSync(path)) unlinkSync(path);
  });

  it("rejects a wrong auth token", async () => {
    const path = tempIpcPath("bad-token");
    const { child, pending } = spawnAuthedIpc(path);
    const { path: boundPath } = await pending;
    const client = await connectIpcClient(boundPath, null);
    client.send({ type: "auth", token: "wrong-token" });
    await client.closed;

    await stopChild(child);
    if (existsSync(path)) unlinkSync(path);
  });

  it("rejects a second auth", async () => {
    const path = tempIpcPath("reauth");
    const { child, pending } = spawnAuthedIpc(path);
    const { path: boundPath } = await pending;
    const client = await connectIpcClient(boundPath);
    client.send({ type: "auth", token: IPC_TOKEN });
    await client.closed;

    await stopChild(child);
    if (existsSync(path)) unlinkSync(path);
  });

  it("rejects oversize NDJSON lines", async () => {
    const path = tempIpcPath("oversize");
    const { child, pending } = spawnAuthedIpc(path);
    const { path: boundPath } = await pending;
    const client = await connectIpcClient(boundPath);
    const big = "x".repeat(config.maxWsMessageBytes + 1);
    client.send({ type: "ping", pad: big });
    const line = await client.nextLine();
    const msg = JSON.parse(line);
    assert.equal(msg.type, "error");
    assert.equal(msg.code, "message_too_large");
    client.close();

    await stopChild(child);
    if (existsSync(path)) unlinkSync(path);
  });

  it("rejects frame without prior join", async () => {
    const path = tempIpcPath("join-gate");
    const { child, pending } = spawnAuthedIpc(path);
    const { path: boundPath } = await pending;
    const client = await connectIpcClient(boundPath);
    client.send({
      type: "frame",
      topicRef: "a".repeat(64),
      roomId: "room-1",
      payload: "opaque",
    });
    const line = await client.nextLine();
    const msg = JSON.parse(line);
    assert.equal(msg.type, "error");
    assert.equal(msg.code, "frame_requires_join");
    client.close();

    await stopChild(child);
    if (existsSync(path)) unlinkSync(path);
  });

  it("cleans stale Unix socket before bind", async () => {
    const path = tempIpcPath("stale");
    writeFileSync(path, "", { mode: 0o600 });

    const { child, pending } = spawnAuthedIpc(path);
    const msg = await pending;
    assert.equal(msg.path, path);

    const client = await connectIpcClient(msg.path);
    client.send({ type: "ping" });
    const line = await client.nextLine();
    assert.equal(JSON.parse(line).type, "pong");
    client.close();

    await stopChild(child);
    if (existsSync(path)) unlinkSync(path);
  });

  it("exits when GNH_BRIDGE_TRANSPORT=ipc without GNH_IPC_PATH", async () => {
    const child = spawnSidecar({
      GNH_BRIDGE_TRANSPORT: "ipc",
    });

    const code = await new Promise((resolve) => {
      child.on("exit", resolve);
    });
    assert.notEqual(code, 0);
  });

  it("exits when the parent sends an empty ipc-auth-token", async () => {
    const child = spawnSidecar(
      {
        GNH_BRIDGE_TRANSPORT: "ipc",
        GNH_IPC_PATH: tempIpcPath("empty-token"),
      },
      { ipc: true },
    );
    child.send({ type: "ipc-auth-token", token: "" });

    const code = await new Promise((resolve) => {
      child.on("exit", resolve);
    });
    assert.notEqual(code, 0);
  });

  it("ignores a second ipc-auth-token once armed", async () => {
    const path = tempIpcPath("rearm");
    const { child, pending } = spawnAuthedIpc(path);
    try {
      await pending;
      child.send({ type: "ipc-auth-token", token: "second-token" });
      await new Promise((r) => setTimeout(r, 200));

      // Still the original token, so re-arming did not take.
      const client = await connectIpcClient(path);
      client.send({ type: "ping" });
      assert.equal(JSON.parse(await client.nextLine()).type, "pong");
      client.close();
    } finally {
      await stopChild(child);
      if (existsSync(path)) unlinkSync(path);
    }
  });

  it("exits when ipc transport has no parent channel", async () => {
    const child = spawnSidecar({
      GNH_BRIDGE_TRANSPORT: "ipc",
      GNH_IPC_PATH: tempIpcPath("no-parent"),
    });

    const code = await new Promise((resolve) => {
      child.on("exit", resolve);
    });
    assert.notEqual(code, 0);
  });
});
