/**
 * Smoke: two local clients on one topic see peers >= 1 and exchange frames.
 * No live DHT required (local fan-out only).
 * Also covers NDJSON framing used on real Hyperswarm Noise streams.
 */

import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import {
  createLineReader,
  createSwarmMesh,
  encodeSwarmLine,
} from "../src/swarm.mjs";

/** Minimal fake Hyperswarm for tests that need a real (non-stubbed) join path. */
function fakeHyperswarm({
  nodes = [{}],
  refresh = async () => {},
  dht = {},
  peers,
} = {}) {
  return {
    dht: { ready: async () => {}, nodes, ...dht },
    peers,
    join: () => ({
      flushed: async () => {},
      refresh,
      destroy: async () => {},
    }),
    on() {},
    destroy: async () => {},
  };
}

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

describe("discovery refresh nudge", () => {
  it("re-announces on an interval while zero peers are found, then stops at the attempt cap", async () => {
    let refreshCount = 0;
    const swarm = fakeHyperswarm({
      refresh: async () => {
        refreshCount += 1;
      },
    });
    const mesh = createSwarmMesh({ swarm });
    const a = fakeClient();
    const topic = "33".repeat(32);

    mock.timers.enable({ apis: ["setInterval"] });
    try {
      await mesh.join(topic, a);
      assert.equal(refreshCount, 0);

      mock.timers.tick(8_000);
      assert.equal(refreshCount, 1);

      // Well past MAX_REFRESH_NUDGES (10) worth of ticks — must not exceed the cap.
      mock.timers.tick(8_000 * 20);
      assert.equal(refreshCount, 10);
    } finally {
      await mesh.destroy();
      mock.timers.reset();
    }
  });

  it("stops re-announcing once a remote peer is adopted on the topic", async () => {
    let refreshCount = 0;
    let connectionHandler;
    const swarm = fakeHyperswarm({
      refresh: async () => {
        refreshCount += 1;
      },
    });
    swarm.on = (event, handler) => {
      if (event === "connection") connectionHandler = handler;
    };
    const mesh = createSwarmMesh({ swarm });
    const a = fakeClient();
    const topic = "44".repeat(32);

    mock.timers.enable({ apis: ["setInterval"] });
    try {
      await mesh.join(topic, a);

      const remotePublicKeyHex = "ab".repeat(32);
      const fakeConn = {
        remotePublicKey: Buffer.from(remotePublicKeyHex, "hex"),
        on() {},
        once() {},
        write() {},
      };
      connectionHandler(fakeConn, { topics: [Buffer.from(topic, "hex")] });

      assert.equal(mesh.peerCount(topic), 1);
      mock.timers.tick(8_000 * 5);
      assert.equal(refreshCount, 0);
    } finally {
      await mesh.destroy();
      mock.timers.reset();
    }
  });

  it("warns but still joins when the DHT routing table is empty after bootstrap", async () => {
    const swarm = fakeHyperswarm({ nodes: [] });
    const mesh = createSwarmMesh({ swarm });
    const a = fakeClient();
    const topic = "55".repeat(32);

    const warnCalls = [];
    const restore = console.warn;
    console.warn = (msg) => warnCalls.push(msg);
    try {
      await mesh.join(topic, a);
    } finally {
      console.warn = restore;
      await mesh.destroy();
    }

    assert.ok(a.inbox.some((m) => m.type === "ready"));
    assert.ok(warnCalls.some((m) => /DHT routing table is empty/.test(m)));
  });

  it("logs a symmetric-NAT warning when the DHT reports a randomized reflexive port", async () => {
    const swarm = fakeHyperswarm({
      dht: {
        firewalled: true,
        randomized: true,
        host: "203.0.113.5",
        port: 41234,
      },
    });
    const mesh = createSwarmMesh({ swarm });
    const a = fakeClient();
    const topic = "66".repeat(32);

    const logCalls = [];
    const restore = console.log;
    console.log = (msg) => logCalls.push(msg);
    try {
      await mesh.join(topic, a);
    } finally {
      console.log = restore;
      await mesh.destroy();
    }

    assert.ok(
      logCalls.some(
        (m) => /NAT:/.test(m) && /randomized=true/.test(m) && /symmetric-NAT/.test(m),
      ),
    );
  });

  it("reports DHT-known candidate count separately from established peer count in the nudge log", async () => {
    const swarm = fakeHyperswarm({ peers: new Map([["a", {}]]) });
    const mesh = createSwarmMesh({ swarm });
    const a = fakeClient();
    const topic = "77".repeat(32);

    const logCalls = [];
    const restore = console.log;
    console.log = (msg) => logCalls.push(msg);
    mock.timers.enable({ apis: ["setInterval"] });
    try {
      await mesh.join(topic, a);
      mock.timers.tick(8_000);
    } finally {
      console.log = restore;
      mock.timers.reset();
      await mesh.destroy();
    }

    assert.ok(
      logCalls.some((m) => /still 0 peers \(DHT candidates known: 1\)/.test(m)),
    );
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
