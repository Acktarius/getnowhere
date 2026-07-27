/**
 * Smoke: two local clients on one topic see peers >= 1 and exchange frames.
 * No live DHT required (local fan-out only).
 * Also covers NDJSON framing used on real Hyperswarm Noise streams.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createLineReader,
  createSwarmMesh,
  encodeSwarmLine,
} from "../src/swarm.mjs";

function fakeClient() {
  /** @type {object[]} */
  const inbox = [];
  return {
    inbox,
    send(msg) {
      inbox.push(msg);
    },
  };
}

describe("swarm mesh local fan-out", () => {
  it("does not count solo join as a peer", async () => {
    const mesh = createSwarmMesh({ disableDiscovery: true });
    const a = fakeClient();
    const topic = "ab".repeat(32);
    await mesh.join(topic, a);
    assert.equal(mesh.peerCount(topic), 0);
    assert.ok(a.inbox.some((m) => m.type === "ready"));
    const peers = a.inbox.filter((m) => m.type === "peers").at(-1);
    assert.equal(peers?.count, 0);
    await mesh.destroy();
  });

  it("second local client raises peer count and receives frames", async () => {
    const mesh = createSwarmMesh({ disableDiscovery: true });
    const a = fakeClient();
    const b = fakeClient();
    const topic = "cd".repeat(32);

    await mesh.join(topic, a);
    await mesh.join(topic, b);
    assert.equal(mesh.peerCount(topic), 1);

    mesh.sendFrame(a, {
      topicRef: topic,
      roomId: "room-1",
      payload: "c2VhbGVk",
    });

    assert.ok(
      b.inbox.some(
        (m) =>
          m.type === "frame" &&
          m.payload === "c2VhbGVk" &&
          m.roomId === "room-1",
      ),
    );
    assert.ok(
      !a.inbox.some((m) => m.type === "frame" && m.payload === "c2VhbGVk"),
    );

    await mesh.destroy();
  });
});

describe("NDJSON swarm framing", () => {
  it("encodeSwarmLine ends with newline", () => {
    const line = encodeSwarmLine({ type: "hello", topicRef: "aa".repeat(32) });
    assert.equal(String.fromCharCode(line[line.byteLength - 1]), "\n");
  });

  it("createLineReader splits coalesced hellos that raw JSON.parse would reject", () => {
    const topic = "ef".repeat(32);
    const coalesced = Buffer.concat([
      encodeSwarmLine({ type: "hello", topicRef: topic }),
      encodeSwarmLine({ type: "hello", topicRef: topic }),
    ]);

    assert.throws(() => JSON.parse(coalesced.toString("utf8")));

    const reader = createLineReader();
    const msgs = reader.push(coalesced);
    assert.equal(msgs.length, 2);
    assert.equal(msgs[0].type, "hello");
    assert.equal(msgs[1].type, "hello");
  });

  it("createLineReader handles fragmented lines across chunks", () => {
    const topic = "11".repeat(32);
    const full = encodeSwarmLine({
      type: "frame",
      topicRef: topic,
      payload: "abc",
    });
    const mid = Math.floor(full.byteLength / 2);
    const reader = createLineReader();
    assert.equal(reader.push(full.subarray(0, mid)).length, 0);
    const msgs = reader.push(full.subarray(mid));
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].type, "frame");
    assert.equal(msgs[0].payload, "abc");
  });
});
