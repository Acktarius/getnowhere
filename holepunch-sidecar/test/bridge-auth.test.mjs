/**
 * Live spawn/WS cases for bridge auth policy (startup guard + ?token=).
 * @see openspec/changes/bridge-auth
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import WebSocket from "ws";

const root = dirname(fileURLToPath(import.meta.url));
const serverEntry = join(root, "..", "src", "server.mjs");

const FIXTURE_TOKEN = "bridge-auth-test-token-α";

/**
 * @param {Record<string, string | undefined>} env
 * @param {{ ipc?: boolean }} [opts]
 */
function spawnSidecar(env, opts = {}) {
  const stdio = opts.ipc
    ? /** @type {const} */ (["ignore", "pipe", "pipe", "ipc"])
    : /** @type {const} */ (["ignore", "pipe", "pipe"]);
  const merged = {
    ...process.env,
    GNH_DISABLE_DISCOVERY: "1",
    GNH_DISABLE_PARENT_DEATH: "1",
    GNH_PARENT_POLL_MS: "60000",
    ...env,
  };
  // Empty string must clear inherited token (spread keeps parent env otherwise).
  if (merged.GNH_SIDECAR_TOKEN === "") {
    delete merged.GNH_SIDECAR_TOKEN;
  }
  return spawn(process.execPath, [serverEntry], {
    env: merged,
    stdio,
  });
}

/** @param {import('node:child_process').ChildProcess} child */
function stopChild(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    const finish = () => {
      clearTimeout(t);
      resolve();
    };
    const t = setTimeout(finish, 2000);
    child.once("exit", finish);
    try {
      child.stdout?.destroy();
      child.stderr?.destroy();
    } catch {
      /* ignore */
    }
    try {
      if (typeof child.disconnect === "function" && child.connected) {
        child.disconnect();
      }
    } catch {
      /* ignore */
    }
    try {
      child.kill("SIGTERM");
    } catch {
      try {
        child.kill("SIGKILL");
      } catch {
        /* sandbox may deny signals */
      }
    }
  });
}

/**
 * @param {import('node:child_process').ChildProcess} child
 * @returns {Promise<number>}
 */
function waitListeningPort(child) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error("timeout waiting for listening IPC"));
    }, 8000);
    child.on("message", (m) => {
      if (
        m &&
        typeof m === "object" &&
        /** @type {{ type?: string }} */ (m).type === "listening" &&
        typeof /** @type {{ port?: unknown }} */ (m).port === "number"
      ) {
        clearTimeout(t);
        resolve(/** @type {{ port: number }} */ (m).port);
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
 * Race exit vs listening IPC. Used to prove fail-closed startup.
 * @param {import('node:child_process').ChildProcess} child
 * @returns {Promise<{ kind: 'exit', code: number | null, heardListening: boolean } | { kind: 'listening', port: number }>}
 */
function waitExitOrListening(child) {
  return new Promise((resolve, reject) => {
    let heardListening = false;
    const t = setTimeout(() => {
      reject(
        new Error(
          "timeout waiting for non-zero exit or listening IPC (flaky/timeout, not policy)",
        ),
      );
    }, 8000);
    child.on("message", (m) => {
      if (
        m &&
        typeof m === "object" &&
        /** @type {{ type?: string }} */ (m).type === "listening" &&
        typeof /** @type {{ port?: unknown }} */ (m).port === "number"
      ) {
        heardListening = true;
        clearTimeout(t);
        resolve({
          kind: "listening",
          port: /** @type {{ port: number }} */ (m).port,
        });
      }
    });
    child.on("exit", (code) => {
      clearTimeout(t);
      resolve({ kind: "exit", code, heardListening });
    });
    child.on("error", (err) => {
      clearTimeout(t);
      reject(err);
    });
  });
}

/**
 * @param {number} port
 * @param {string} [query] e.g. "token=secret" (no leading ?)
 * @returns {Promise<import('ws').WebSocket>}
 */
function connectWs(port, query = "") {
  const qs = query ? `?${query}` : "";
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${qs}`);
    const t = setTimeout(() => {
      ws.terminate();
      reject(new Error("timeout connecting WS"));
    }, 5000);
    ws.once("open", () => {
      clearTimeout(t);
      resolve(ws);
    });
    ws.once("error", (err) => {
      clearTimeout(t);
      reject(err);
    });
  });
}

/**
 * Connect and wait for close (auth reject path may open briefly then close).
 * @param {number} port
 * @param {string} [query]
 * @returns {Promise<number>}
 */
function connectExpectClose(port, query = "") {
  const qs = query ? `?${query}` : "";
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${qs}`);
    const t = setTimeout(() => {
      ws.terminate();
      reject(new Error("timeout waiting for WS close"));
    }, 5000);
    ws.once("close", (code) => {
      clearTimeout(t);
      resolve(code);
    });
    ws.once("error", () => {
      /* close event still expected */
    });
  });
}

describe("bridge auth — non-loopback bind requires sidecar token", () => {
  it("(a) 0.0.0.0 + empty token → non-zero exit, no IPC listening", async () => {
    const child = spawnSidecar(
      {
        HOLEPUNCH_HOST: "0.0.0.0",
        HOLEPUNCH_PORT: "0",
        GNH_SIDECAR_TOKEN: "",
      },
      { ipc: true },
    );

    const outcome = await waitExitOrListening(child);
    await stopChild(child);

    assert.equal(
      outcome.kind,
      "exit",
      "non-loopback + empty token must exit before accept (got IPC listening — policy missing)",
    );
    assert.notEqual(outcome.code, 0, "exit code must be non-zero");
    assert.equal(
      outcome.heardListening,
      false,
      "must not send IPC listening before exit",
    );
  });

  it("(b) 127.0.0.1 + empty token → listens", async () => {
    const child = spawnSidecar(
      {
        HOLEPUNCH_HOST: "127.0.0.1",
        HOLEPUNCH_PORT: "0",
        GNH_SIDECAR_TOKEN: "",
      },
      { ipc: true },
    );

    try {
      const port = await waitListeningPort(child);
      assert.ok(port > 0);
    } finally {
      await stopChild(child);
    }
  });

  it("(c) 0.0.0.0 + non-empty token → listens", async () => {
    const child = spawnSidecar(
      {
        HOLEPUNCH_HOST: "0.0.0.0",
        HOLEPUNCH_PORT: "0",
        GNH_SIDECAR_TOKEN: FIXTURE_TOKEN,
      },
      { ipc: true },
    );

    try {
      const port = await waitListeningPort(child);
      assert.ok(port > 0);
    } finally {
      await stopChild(child);
    }
  });
});

describe("bridge auth — token query gate", () => {
  it("(d) token set + wrong/missing ?token= → WS close 4001", async () => {
    const child = spawnSidecar(
      {
        HOLEPUNCH_HOST: "127.0.0.1",
        HOLEPUNCH_PORT: "0",
        GNH_SIDECAR_TOKEN: FIXTURE_TOKEN,
      },
      { ipc: true },
    );

    try {
      const port = await waitListeningPort(child);

      const missingCode = await connectExpectClose(port);
      assert.equal(missingCode, 4001, "missing token must close 4001");

      const wrongCode = await connectExpectClose(
        port,
        `token=${encodeURIComponent("wrong-" + FIXTURE_TOKEN)}`,
      );
      assert.equal(wrongCode, 4001, "wrong token must close 4001");
    } finally {
      await stopChild(child);
    }
  });

  it("(e) token set + correct ?token= → WS connects", async () => {
    const child = spawnSidecar(
      {
        HOLEPUNCH_HOST: "127.0.0.1",
        HOLEPUNCH_PORT: "0",
        GNH_SIDECAR_TOKEN: FIXTURE_TOKEN,
      },
      { ipc: true },
    );

    /** @type {import('ws').WebSocket | undefined} */
    let ws;
    try {
      const port = await waitListeningPort(child);
      ws = await connectWs(
        port,
        `token=${encodeURIComponent(FIXTURE_TOKEN)}`,
      );
      assert.equal(ws.readyState, WebSocket.OPEN);
    } finally {
      try {
        ws?.terminate();
      } catch {
        /* ignore */
      }
      await stopChild(child);
    }
  });
});
