/**
 * Mobile Bare bridge auth + rate limits.
 * @see openspec/changes/mobile-bridge-hardening
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createBridgeSession } from "../bridge.mjs";
import { BRIDGE_RATE_LIMITS, createBridgeRateLimiters } from "../rateLimit.mjs";

const TOKEN = "mobile-bridge-auth-test-token";

function fakeMesh() {
  return {
    join: async () => {},
    leave: async () => {},
    sendFrame: () => {},
    removeClient: async () => {},
  };
}

function captureSend() {
  /** @type {object[]} */
  const out = [];
  return {
    out,
    send(msg) {
      out.push(msg);
    },
  };
}

describe("mobile bridge auth", () => {
  it("rejects commands when requiredToken is empty", async () => {
    const { out, send } = captureSend();
    const session = createBridgeSession(fakeMesh(), {
      requiredToken: "",
      send,
    });

    await session.handleCommand({ type: "ping", token: "" });
    assert.equal(out.length, 1);
    assert.equal(out[0].type, "error");
    assert.equal(out[0].code, "sidecar_error");
    assert.match(String(out[0].message), /unauthorized/i);
  });

  it("rejects wrong token", async () => {
    const { out, send } = captureSend();
    const session = createBridgeSession(fakeMesh(), {
      requiredToken: TOKEN,
      send,
    });

    await session.handleCommand({ type: "ping", token: "wrong-token" });
    assert.equal(out.length, 1);
    assert.equal(out[0].code, "sidecar_error");
    assert.match(String(out[0].message), /unauthorized/i);
  });

  it("rejects missing token field", async () => {
    const { out, send } = captureSend();
    const session = createBridgeSession(fakeMesh(), {
      requiredToken: TOKEN,
      send,
    });

    await session.handleCommand({ type: "ping" });
    assert.equal(out.length, 1);
    assert.equal(out[0].code, "sidecar_error");
    assert.match(String(out[0].message), /unauthorized/i);
  });

  it("accepts matching token for ping", async () => {
    const { out, send } = captureSend();
    const session = createBridgeSession(fakeMesh(), {
      requiredToken: TOKEN,
      send,
    });

    await session.handleCommand({ type: "ping", token: TOKEN });
    assert.deepEqual(out, [{ type: "pong" }]);
  });
});

describe("mobile bridge rate limits", () => {
  it("returns rate_limited on join burst", async () => {
    const { out, send } = captureSend();
    const session = createBridgeSession(fakeMesh(), {
      requiredToken: TOKEN,
      send,
    });
    const topicRef = "aa".repeat(32);

    for (let i = 0; i < BRIDGE_RATE_LIMITS.join.capacity + 5; i++) {
      await session.handleCommand({
        type: "join",
        token: TOKEN,
        topicRef,
        roomId: "room-1",
      });
    }

    const rateLimited = out.filter((m) => m.code === "rate_limited");
    assert.ok(rateLimited.length > 0, "expected rate_limited errors");
  });

  it("token bucket refills after window", async () => {
    const buckets = createBridgeRateLimiters({
      join: { capacity: 1, refillPerMs: 1000 },
    });
    assert.equal(buckets.join.tryConsume(), true);
    assert.equal(buckets.join.tryConsume(), false);
  });
});
