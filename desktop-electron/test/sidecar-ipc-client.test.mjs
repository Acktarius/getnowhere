/**
 * Unit tests for sidecar IPC client NDJSON framing.
 */

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  connectSidecarIpc,
  createSidecarIpcConnection,
} from "../sidecar-ipc-client.mjs";

describe("sidecar-ipc-client", () => {
  it("connectSidecarIpc sends commands and receives NDJSON events", async () => {
    const ipcPath = join(tmpdir(), `gnh-test-client-${process.pid}.sock`);
    const server = createServer((socket) => {
      socket.on("data", (chunk) => {
        const lines = chunk.toString().split("\n").filter(Boolean);
        for (const line of lines) {
          const msg = JSON.parse(line);
          if (msg.type === "auth" && msg.token === "test-token") {
            socket.write(`${JSON.stringify({ type: "auth-ok" })}\n`);
          }
          if (msg.type === "ping") {
            socket.write(`${JSON.stringify({ type: "pong" })}\n`);
          }
        }
      });
    });

    await new Promise((resolve, reject) => {
      server.listen(ipcPath, () => resolve(undefined));
      server.once("error", reject);
    });

    const conn = await connectSidecarIpc(ipcPath, {
      token: "test-token",
      retries: 5,
      delayMs: 20,
    });
    const events = [];
    const off = conn.onEvent((msg) => events.push(msg));
    conn.send({ type: "ping" });
    await new Promise((r) => setTimeout(r, 80));
    off();
    conn.close();
    server.close();

    assert.deepEqual(events, [{ type: "pong" }]);
  });

  it("createSidecarIpcConnection parses fragmented NDJSON", async () => {
    const fake = new EventEmitter();
    fake.destroyed = false;
    fake.destroy = () => {
      fake.destroyed = true;
    };
    fake.write = () => {
      fake.emit("data", Buffer.from('{"type":"auth-ok"}\n'));
    };
    const conn = createSidecarIpcConnection(
      /** @type {import('node:net').Socket} */ (fake),
    );
    await conn.authenticate("test-token");
    const got = [];
    conn.onEvent((m) => got.push(m));
    fake.emit(
      "data",
      Buffer.from('{"type":"peers","topicRef":"abc","count":'),
    );
    fake.emit("data", Buffer.from('1}\n'));
    assert.equal(got.length, 1);
    assert.equal(got[0].type, "peers");
    conn.close();
  });

  it("emits sidecar_error after auth when the socket closes", async () => {
    const fake = new EventEmitter();
    fake.destroyed = false;
    fake.destroy = () => {
      fake.destroyed = true;
    };
    fake.write = () => {
      fake.emit("data", Buffer.from('{"type":"auth-ok"}\n'));
    };
    const conn = createSidecarIpcConnection(
      /** @type {import('node:net').Socket} */ (fake),
    );
    await conn.authenticate("test-token");
    const got = [];
    conn.onEvent((m) => got.push(m));
    fake.emit("close");
    assert.equal(got.length, 1);
    assert.equal(got[0].type, "error");
    assert.equal(got[0].code, "sidecar_error");
    conn.close();
  });
});
