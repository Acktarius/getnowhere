import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { startParentDeathWatch } from "../src/parent-death.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const serverEntry = join(root, "..", "src", "server.mjs");

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
      ...env,
    },
    stdio,
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      if (!addr || typeof addr === "string") {
        s.close();
        reject(new Error("no port"));
        return;
      }
      const p = addr.port;
      s.close((err) => (err ? reject(err) : resolve(p)));
    });
  });
}

/** @param {import('node:child_process').ChildProcess} child */
function stopChild(child) {
  try {
    child.kill("SIGTERM");
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      /* sandbox may deny signals */
    }
  }
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    const t = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      resolve();
    }, 2000);
    child.once("exit", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

describe("sidecar listening IPC and bind failure", () => {
  it("sends IPC listening with a real non-zero port when HOLEPUNCH_PORT=0", async () => {
    const child = spawnSidecar(
      {
        HOLEPUNCH_HOST: "127.0.0.1",
        HOLEPUNCH_PORT: "0",
        GNH_PARENT_POLL_MS: "60000",
      },
      { ipc: true },
    );

    const msg = await new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("timeout waiting for listening IPC"));
      }, 8000);
      child.on("message", (m) => {
        clearTimeout(t);
        resolve(m);
      });
      child.on("exit", (code) => {
        clearTimeout(t);
        reject(new Error(`sidecar exited early code=${code}`));
      });
      let err = "";
      child.stderr?.on("data", (c) => {
        err += String(c);
      });
      child.on("error", reject);
    });

    assert.equal(msg.type, "listening");
    assert.equal(typeof msg.port, "number");
    assert.ok(msg.port > 0);
    assert.notEqual(msg.port, 7901);

    await stopChild(child);
  });

  it("exits non-zero when the port is already bound", async () => {
    const occupied = await freePort();
    const holder = createServer();
    await new Promise((resolve, reject) => {
      holder.listen(occupied, "127.0.0.1", (err) =>
        err ? reject(err) : resolve(),
      );
    });

    const child = spawnSidecar({
      HOLEPUNCH_HOST: "127.0.0.1",
      HOLEPUNCH_PORT: String(occupied),
      GNH_PARENT_POLL_MS: "60000",
    });

    let stderr = "";
    child.stderr?.on("data", (c) => {
      stderr += String(c);
    });
    child.stdout?.on("data", (c) => {
      stderr += String(c);
    });

    const code = await new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        void stopChild(child).then(() =>
          reject(new Error("timeout waiting for bind failure exit")),
        );
      }, 8000);
      child.on("exit", (c) => {
        clearTimeout(t);
        resolve(c);
      });
    });

    holder.close();
    assert.notEqual(code, 0);
    assert.match(stderr, /address already in use/i);
  });
});

describe("parent death watch", () => {
  it("exits when ppid becomes 1", async () => {
    let calls = 0;
    /** @type {number[]} */
    const exits = [];
    const stop = startParentDeathWatch({
      getPpid: () => {
        calls += 1;
        return calls < 2 ? 12345 : 1;
      },
      exit: (code) => {
        exits.push(code ?? 0);
      },
      intervalMs: 20,
    });
    await new Promise((r) => setTimeout(r, 80));
    stop();
    assert.ok(exits.includes(1));
  });

  it("exits when ppid changes from the initial parent", async () => {
    let n = 0;
    /** @type {number[]} */
    const exits = [];
    const stop = startParentDeathWatch({
      getPpid: () => {
        n += 1;
        return n === 1 ? 99 : 100;
      },
      exit: (code) => {
        exits.push(code ?? 0);
      },
      intervalMs: 20,
    });
    await new Promise((r) => setTimeout(r, 80));
    stop();
    assert.ok(exits.includes(1));
  });
});
