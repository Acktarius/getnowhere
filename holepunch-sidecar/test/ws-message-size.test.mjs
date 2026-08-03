/**
 * Live WS size gates for the holepunch sidecar bridge.
 * Limits come from production DEFAULTS (fixture source of truth).
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import WebSocket from "ws";
import { DEFAULTS } from "../src/config.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const serverEntry = join(root, "..", "src", "server.mjs");

const MAX_WS_MESSAGE_BYTES = DEFAULTS.maxWsMessageBytes;
const MAX_FRAME_PAYLOAD_BYTES = DEFAULTS.maxFramePayloadBytes;

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
 * @param {number} port
 * @returns {Promise<import('ws').WebSocket>}
 */
function connectWs(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
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
 * @param {import('ws').WebSocket} ws
 * @returns {{ inbox: object[], closeCode: number | null, closePromise: Promise<number> }}
 */
function trackClient(ws) {
  /** @type {object[]} */
  const inbox = [];
  /** @type {{ code: number | null }} */
  const state = { code: null };
  const closePromise = new Promise((resolve) => {
    ws.on("close", (code) => {
      state.code = code;
      resolve(code);
    });
  });
  ws.on("message", (raw) => {
    try {
      inbox.push(JSON.parse(String(raw)));
    } catch {
      inbox.push({ type: "_unparsed", raw: String(raw) });
    }
  });
  return {
    inbox,
    get closeCode() {
      return state.code;
    },
    closePromise,
  };
}

/**
 * @param {import('ws').WebSocket} ws
 * @param {object[]} inbox
 * @param {string} topicRef
 * @param {string} roomId
 */
async function joinTopic(ws, inbox, topicRef, roomId) {
  ws.send(JSON.stringify({ type: "join", topicRef, roomId }));
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (inbox.some((m) => m.type === "ready" || m.type === "peers")) {
      return;
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("timeout waiting for join ready/peers");
}

/**
 * @param {() => boolean} pred
 * @param {number} ms
 */
async function waitUntil(pred, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (pred()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return pred();
}

describe("WS bridge message size bounds (live sidecar)", () => {
  /** @type {import('node:child_process').ChildProcess} */
  let child;
  /** @type {number} */
  let port;

  before(async () => {
    child = spawnSidecar(
      {
        HOLEPUNCH_HOST: "127.0.0.1",
        HOLEPUNCH_PORT: "0",
        GNH_PARENT_POLL_MS: "60000",
        GNH_DISABLE_PARENT_DEATH: "1",
      },
      { ipc: true },
    );
    port = await waitListeningPort(child);
  });

  after(async () => {
    await stopChild(child);
  });

  it("rejects raw message larger than maxWsMessageBytes with error then close 1009", async () => {
    const ws = await connectWs(port);
    const client = trackClient(ws);

    const oversized = Buffer.alloc(MAX_WS_MESSAGE_BYTES + 1, 0x61);
    assert.equal(
      oversized.byteLength,
      MAX_WS_MESSAGE_BYTES + 1,
      "fixture must be exactly one byte over the WS max",
    );

    ws.send(oversized);

    const sawError = await waitUntil(
      () =>
        client.inbox.some(
          (m) => m.type === "error" && m.code === "message_too_large",
        ),
      3000,
    );
    assert.ok(
      sawError,
      `expected code=message_too_large; inbox=${JSON.stringify(client.inbox)}`,
    );
    const err = client.inbox.find(
      (m) => m.type === "error" && m.code === "message_too_large",
    );
    assert.equal(typeof err?.message, "string");

    const closeCode = await Promise.race([
      client.closePromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout waiting for close")), 3000),
      ),
    ]);
    assert.equal(closeCode, 1009);
    try {
      ws.terminate();
    } catch {
      /* already closed */
    }
  });

  it("rejects oversize frame payload with error then close 1009", async () => {
    const topicRef = "11".repeat(32);
    const roomId = "room-payload-err";
    const payload = "p".repeat(MAX_FRAME_PAYLOAD_BYTES + 1);
    const frame = {
      type: "frame",
      topicRef,
      roomId,
      payload,
    };
    const raw = JSON.stringify(frame);
    const rawBytes = Buffer.byteLength(raw, "utf8");
    const payloadBytes = Buffer.byteLength(payload, "utf8");

    assert.equal(payloadBytes, MAX_FRAME_PAYLOAD_BYTES + 1);
    assert.ok(
      rawBytes <= MAX_WS_MESSAGE_BYTES,
      `fixture total ${rawBytes} must stay under WS max ${MAX_WS_MESSAGE_BYTES}`,
    );
    assert.ok(payloadBytes > MAX_FRAME_PAYLOAD_BYTES);

    const ws = await connectWs(port);
    const client = trackClient(ws);
    await joinTopic(ws, client.inbox, topicRef, roomId);
    client.inbox.length = 0;

    ws.send(raw);

    const sawError = await waitUntil(
      () =>
        client.inbox.some(
          (m) => m.type === "error" && m.code === "payload_too_large",
        ),
      3000,
    );
    assert.ok(
      sawError,
      `expected code=payload_too_large; inbox=${JSON.stringify(client.inbox)}`,
    );
    const err = client.inbox.find(
      (m) => m.type === "error" && m.code === "payload_too_large",
    );
    assert.equal(typeof err?.message, "string");

    const closeCode = await Promise.race([
      client.closePromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout waiting for close")), 3000),
      ),
    ]);
    assert.equal(closeCode, 1009);
    try {
      ws.terminate();
    } catch {
      /* already closed */
    }
  });

  it("returns code=invalid_json for malformed JSON", async () => {
    const ws = await connectWs(port);
    const client = trackClient(ws);

    ws.send("{not-json");

    const sawError = await waitUntil(
      () =>
        client.inbox.some(
          (m) => m.type === "error" && m.code === "invalid_json",
        ),
      3000,
    );
    assert.ok(
      sawError,
      `expected code=invalid_json; inbox=${JSON.stringify(client.inbox)}`,
    );
    const err = client.inbox.find(
      (m) => m.type === "error" && m.code === "invalid_json",
    );
    assert.equal(typeof err?.message, "string");

    try {
      ws.terminate();
    } catch {
      /* ignore */
    }
  });

  it("returns code=frame_requires_join when framing before join", async () => {
    const topicRef = "44".repeat(32);
    const payload = "needs-join-first";
    const frame = {
      type: "frame",
      topicRef,
      roomId: "room-no-join",
      payload,
    };
    const raw = JSON.stringify(frame);
    assert.ok(Buffer.byteLength(raw, "utf8") <= MAX_WS_MESSAGE_BYTES);
    assert.ok(Buffer.byteLength(payload, "utf8") <= MAX_FRAME_PAYLOAD_BYTES);

    const ws = await connectWs(port);
    const client = trackClient(ws);

    ws.send(raw);

    const sawError = await waitUntil(
      () =>
        client.inbox.some(
          (m) => m.type === "error" && m.code === "frame_requires_join",
        ),
      3000,
    );
    assert.ok(
      sawError,
      `expected code=frame_requires_join; inbox=${JSON.stringify(client.inbox)}`,
    );
    const err = client.inbox.find(
      (m) => m.type === "error" && m.code === "frame_requires_join",
    );
    assert.equal(typeof err?.message, "string");

    try {
      ws.terminate();
    } catch {
      /* ignore */
    }
  });

  it("does not fan out oversized frame payload to a second joined client", async () => {
    const topicRef = "22".repeat(32);
    const roomId = "room-no-fanout";
    const payload = "q".repeat(MAX_FRAME_PAYLOAD_BYTES + 1);
    const frame = {
      type: "frame",
      topicRef,
      roomId,
      payload,
    };
    const raw = JSON.stringify(frame);
    const rawBytes = Buffer.byteLength(raw, "utf8");
    const payloadBytes = Buffer.byteLength(payload, "utf8");

    assert.equal(payloadBytes, MAX_FRAME_PAYLOAD_BYTES + 1);
    assert.ok(rawBytes <= MAX_WS_MESSAGE_BYTES);
    assert.ok(payloadBytes > MAX_FRAME_PAYLOAD_BYTES);

    const wsA = await connectWs(port);
    const wsB = await connectWs(port);
    const a = trackClient(wsA);
    const b = trackClient(wsB);

    await joinTopic(wsA, a.inbox, topicRef, roomId);
    await joinTopic(wsB, b.inbox, topicRef, roomId);
    a.inbox.length = 0;
    b.inbox.length = 0;

    wsA.send(raw);

    // Allow time for today's buggy fan-out (or a future error path) to settle.
    await new Promise((r) => setTimeout(r, 800));

    const bFrames = b.inbox.filter(
      (m) => m.type === "frame" && m.payload === payload,
    );
    assert.equal(
      bFrames.length,
      0,
      "oversized payload must not fan out to another joined client",
    );

    try {
      wsA.terminate();
      wsB.terminate();
    } catch {
      /* ignore */
    }
  });

  it("fans out under-limit frame to a second joined client", async () => {
    const topicRef = "33".repeat(32);
    const roomId = "room-ok";
    const payload = "under-limit-marker-ok";
    const frame = {
      type: "frame",
      topicRef,
      roomId,
      payload,
    };
    const raw = JSON.stringify(frame);
    const rawBytes = Buffer.byteLength(raw, "utf8");
    const payloadBytes = Buffer.byteLength(payload, "utf8");

    assert.ok(payloadBytes <= MAX_FRAME_PAYLOAD_BYTES);
    assert.ok(rawBytes <= MAX_WS_MESSAGE_BYTES);

    const wsA = await connectWs(port);
    const wsB = await connectWs(port);
    const a = trackClient(wsA);
    const b = trackClient(wsB);

    await joinTopic(wsA, a.inbox, topicRef, roomId);
    await joinTopic(wsB, b.inbox, topicRef, roomId);
    a.inbox.length = 0;
    b.inbox.length = 0;

    wsA.send(raw);

    const delivered = await waitUntil(
      () =>
        b.inbox.some(
          (m) =>
            m.type === "frame" &&
            m.payload === payload &&
            m.roomId === roomId,
        ),
      3000,
    );
    assert.ok(delivered, `expected under-limit fan-out; b=${JSON.stringify(b.inbox)}`);

    try {
      wsA.terminate();
      wsB.terminate();
    } catch {
      /* ignore */
    }
  });
});
