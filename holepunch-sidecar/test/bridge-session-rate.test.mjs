/**
 * Per-session command rate limits (Bare parity, SEC-2026-020).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBridgeSession } from "../src/bridge-session.mjs";

const topicRef = "aa".repeat(32);

function fakeMesh() {
  let joins = 0;
  return {
    joins: () => joins,
    join: async () => {
      joins += 1;
    },
    leave: async () => {},
    sendFrame() {},
    removeClient: async () => {},
  };
}

function captureTransport() {
  /** @type {object[]} */
  const out = [];
  return {
    out,
    send(msg) {
      out.push(msg);
    },
    sendError(code, message) {
      out.push({ type: "error", code, message });
    },
    rejectOversize(code) {
      out.push({ type: "error", code });
    },
  };
}

describe("bridge session rate limits", () => {
  it("returns rate_limited on join burst and does not close", async () => {
    const mesh = fakeMesh();
    const transport = captureTransport();
    const session = createBridgeSession(mesh, transport);
    for (let i = 0; i < 8 + 5; i++) {
      const keep = await session.handleParsedMessage({
        type: "join",
        topicRef,
        roomId: "room-1",
      });
      assert.equal(keep, true);
    }
    const limited = transport.out.filter((m) => m.code === "rate_limited");
    assert.ok(limited.length > 0, "expected rate_limited errors");
    assert.equal(mesh.joins(), 8);
  });
});
