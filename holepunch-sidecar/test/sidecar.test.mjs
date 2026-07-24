/**
 * Smoke: two local clients on one topic see peers >= 1 and exchange frames.
 * No live DHT required (local fan-out only).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSwarmMesh } from "../src/swarm.mjs";

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
    const mesh = createSwarmMesh();
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
    const mesh = createSwarmMesh();
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
