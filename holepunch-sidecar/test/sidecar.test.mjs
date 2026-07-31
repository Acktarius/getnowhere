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
  refreshNudgeDelayMs,
} from "../src/swarm.mjs";

/** Minimal fake Hyperswarm for tests that need a real (non-stubbed) join path. */
function fakeHyperswarm({
  nodes = [{}],
  refresh = async () => {},
  dht = {},
  peers,
} = {}) {
  /** @type {Map<string, Function[]>} */
  const handlers = new Map();
  return {
    dht: { ready: async () => {}, nodes, ...dht },
    peers,
    join: () => ({
      flushed: async () => {},
      refresh,
      destroy: async () => {},
    }),
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    /** @param {object} conn @param {object} info */
    emitConnection(conn, info) {
      for (const handler of handlers.get("connection") ?? []) {
        handler(conn, info);
      }
    },
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

/** Captures NDJSON writes and inbound data handlers for swarm connection tests. */
function fakeConn() {
  /** @type {Uint8Array[]} */
  const writes = [];
  /** @type {Function[]} */
  const dataHandlers = [];
  /** @type {Function | undefined} */
  let closeHandler;
  return {
    writes,
    remotePublicKey: Buffer.from("ab".repeat(32), "hex"),
    write(buf) {
      writes.push(buf);
    },
    on(event, handler) {
      if (event === "data") dataHandlers.push(handler);
    },
    once(event, handler) {
      if (event === "close") closeHandler = handler;
    },
    emitData(buf) {
      for (const handler of dataHandlers) handler(buf);
    },
    emitClose() {
      closeHandler?.();
    },
    parsedWrites() {
      const reader = createLineReader();
      /** @type {object[]} */
      const out = [];
      for (const chunk of writes) out.push(...reader.push(chunk));
      return out;
    },
  };
}

/** PeerInfo-shaped object with optional later `topic` events. */
function fakePeerInfo(topicHexes) {
  /** @type {Function[]} */
  const topicHandlers = [];
  const topics = topicHexes.map((hex) => Buffer.from(hex, "hex"));
  return {
    topics,
    on(event, handler) {
      if (event === "topic") topicHandlers.push(handler);
    },
    emitTopic(topicHex) {
      const buf = Buffer.from(topicHex, "hex");
      topics.push(buf);
      for (const handler of topicHandlers) handler(buf);
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
  it("escalates the delay but never stops re-announcing while zero peers are found", async () => {
    let refreshCount = 0;
    const swarm = fakeHyperswarm({
      refresh: async () => {
        refreshCount += 1;
      },
    });
    const mesh = createSwarmMesh({ swarm });
    const a = fakeClient();
    const topic = "33".repeat(32);

    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      await mesh.join(topic, a);
      assert.equal(refreshCount, 0);

      // First three nudges are 8s apart.
      mock.timers.tick(8_000);
      assert.equal(refreshCount, 1);
      mock.timers.tick(8_000);
      mock.timers.tick(8_000);
      assert.equal(refreshCount, 3);

      // Fourth has backed off to 30s — 8s must not be enough on its own.
      mock.timers.tick(8_000);
      assert.equal(refreshCount, 3);
      mock.timers.tick(22_000);
      assert.equal(refreshCount, 4);

      // Steady state keeps going indefinitely (old build capped out at 10).
      for (let i = 0; i < 30; i++) mock.timers.tick(60_000);
      assert.ok(
        refreshCount > 10,
        `expected uncapped nudges, got ${refreshCount}`,
      );
    } finally {
      await mesh.destroy();
      mock.timers.reset();
    }
  });

  it("exposes the escalating delay schedule", () => {
    assert.equal(refreshNudgeDelayMs(0), 8_000);
    assert.equal(refreshNudgeDelayMs(2), 8_000);
    assert.equal(refreshNudgeDelayMs(3), 30_000);
    assert.equal(refreshNudgeDelayMs(5), 30_000);
    assert.equal(refreshNudgeDelayMs(6), 60_000);
    assert.equal(refreshNudgeDelayMs(999), 60_000);
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

    mock.timers.enable({ apis: ["setTimeout"] });
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

  it("resumes re-announcing when the adopted peer is lost", async () => {
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
    const topic = "88".repeat(32);

    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      await mesh.join(topic, a);

      let closeHandler;
      const fakeConn = {
        remotePublicKey: Buffer.from("ab".repeat(32), "hex"),
        on() {},
        once(event, handler) {
          if (event === "close") closeHandler = handler;
        },
        write() {},
      };
      connectionHandler(fakeConn, { topics: [Buffer.from(topic, "hex")] });
      assert.equal(mesh.peerCount(topic), 1);

      mock.timers.tick(8_000 * 3);
      assert.equal(refreshCount, 0);

      closeHandler();
      assert.equal(mesh.peerCount(topic), 0);

      // Backoff restarts from the fast step for the reconnect.
      mock.timers.tick(8_000);
      assert.equal(refreshCount, 1);
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
    mock.timers.enable({ apis: ["setTimeout"] });
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

describe("cross-topic hello isolation", () => {
  it("does not advertise unrelated local topics on a connection that only shares A", async () => {
    const swarm = fakeHyperswarm();
    const mesh = createSwarmMesh({ swarm });
    const client = fakeClient();
    const topicA = "a1".repeat(32);
    const topicB = "b2".repeat(32);

    try {
      await mesh.join(topicA, client);
      await mesh.join(topicB, client);

      const conn = fakeConn();
      swarm.emitConnection(conn, fakePeerInfo([topicA]));

      const hellos = conn.parsedWrites().filter((m) => m.type === "hello");
      assert.equal(hellos.length, 0);
      assert.ok(!hellos.some((m) => m.topicRef === topicB));
      assert.equal(mesh.peerCount(topicA), 1);
      assert.equal(mesh.peerCount(topicB), 0);
    } finally {
      await mesh.destroy();
    }
  });

  it("ignores forged hello for a topic not Hyperswarm-associated on the connection", async () => {
    const swarm = fakeHyperswarm();
    const mesh = createSwarmMesh({ swarm });
    const client = fakeClient();
    const topicA = "c3".repeat(32);
    const topicB = "d4".repeat(32);

    try {
      await mesh.join(topicA, client);
      await mesh.join(topicB, client);

      const conn = fakeConn();
      swarm.emitConnection(conn, fakePeerInfo([topicA]));
      assert.equal(mesh.peerCount(topicB), 0);

      conn.emitData(encodeSwarmLine({ type: "hello", topicRef: topicB }));
      assert.equal(mesh.peerCount(topicB), 0);

      // Later local join must not adopt from a pre-seeded hello either.
      const client2 = fakeClient();
      await mesh.leave(topicB, client);
      await mesh.join(topicB, client2);
      assert.equal(mesh.peerCount(topicB), 0);
    } finally {
      await mesh.destroy();
    }
  });

  it("adopts peers from Hyperswarm info.topics and later topic events", async () => {
    const swarm = fakeHyperswarm();
    const mesh = createSwarmMesh({ swarm });
    const client = fakeClient();
    const topicA = "e5".repeat(32);
    const topicB = "f6".repeat(32);

    try {
      await mesh.join(topicA, client);
      await mesh.join(topicB, client);

      const conn = fakeConn();
      const info = fakePeerInfo([topicA]);
      swarm.emitConnection(conn, info);
      assert.equal(mesh.peerCount(topicA), 1);
      assert.equal(mesh.peerCount(topicB), 0);

      info.emitTopic(topicB);
      assert.equal(mesh.peerCount(topicB), 1);
    } finally {
      await mesh.destroy();
    }
  });

  it("does not broadcast hello for B to a connection adopted only for A", async () => {
    const swarm = fakeHyperswarm();
    const mesh = createSwarmMesh({ swarm });
    const client = fakeClient();
    const topicA = "17".repeat(32);
    const topicB = "18".repeat(32);

    try {
      await mesh.join(topicA, client);
      const conn = fakeConn();
      swarm.emitConnection(conn, fakePeerInfo([topicA]));
      assert.equal(mesh.peerCount(topicA), 1);

      conn.writes.length = 0;
      await mesh.join(topicB, client);

      const hellos = conn.parsedWrites().filter((m) => m.type === "hello");
      assert.equal(hellos.length, 0);
      assert.ok(!hellos.some((m) => m.topicRef === topicB));
      assert.equal(mesh.peerCount(topicB), 0);
    } finally {
      await mesh.destroy();
    }
  });
});

describe("sendFrame join authorization", () => {
  it("does not fan out or write swarm when sender never joined", async () => {
    const swarm = fakeHyperswarm();
    const mesh = createSwarmMesh({ swarm });
    const a = fakeClient();
    const b = fakeClient();
    const topic = "b0".repeat(32);

    try {
      await mesh.join(topic, a);

      const conn = fakeConn();
      swarm.emitConnection(conn, fakePeerInfo([topic]));
      assert.equal(mesh.peerCount(topic), 1);

      conn.writes.length = 0;

      mesh.sendFrame(b, {
        topicRef: topic,
        roomId: "room-inject",
        payload: "aW5qZWN0",
      });

      assert.ok(
        !a.inbox.some(
          (m) =>
            m.type === "frame" &&
            m.payload === "aW5qZWN0" &&
            m.roomId === "room-inject",
        ),
      );

      const frames = conn.parsedWrites().filter((m) => m.type === "frame");
      assert.equal(frames.length, 0);
    } finally {
      await mesh.destroy();
    }
  });

  it("still fans out when sender has joined", async () => {
    const mesh = createSwarmMesh({ disableDiscovery: true });
    const a = fakeClient();
    const b = fakeClient();
    const topic = "b1".repeat(32);

    try {
      await mesh.join(topic, a);
      await mesh.join(topic, b);

      mesh.sendFrame(a, {
        topicRef: topic,
        roomId: "room-ok",
        payload: "c2VhbGVk",
      });

      assert.ok(
        b.inbox.some(
          (m) =>
            m.type === "frame" &&
            m.payload === "c2VhbGVk" &&
            m.roomId === "room-ok",
        ),
      );
    } finally {
      await mesh.destroy();
    }
  });
});

describe("inbound frame authorization", () => {
  it("does not deliver remote frame for B on an A-only connection", async () => {
    const swarm = fakeHyperswarm();
    const mesh = createSwarmMesh({ swarm });
    const client = fakeClient();
    const topicA = "91".repeat(32);
    const topicB = "92".repeat(32);

    try {
      await mesh.join(topicA, client);
      await mesh.join(topicB, client);

      const conn = fakeConn();
      swarm.emitConnection(conn, fakePeerInfo([topicA]));
      assert.equal(mesh.peerCount(topicA), 1);
      assert.equal(mesh.peerCount(topicB), 0);

      conn.emitData(
        encodeSwarmLine({
          type: "frame",
          topicRef: topicB,
          roomId: "room-inject",
          payload: "aW5qZWN0",
        }),
      );

      assert.ok(
        !client.inbox.some(
          (m) =>
            m.type === "frame" &&
            m.topicRef === topicB &&
            m.payload === "aW5qZWN0",
        ),
      );
    } finally {
      await mesh.destroy();
    }
  });

  it("delivers remote frame for B after Hyperswarm associates B", async () => {
    const swarm = fakeHyperswarm();
    const mesh = createSwarmMesh({ swarm });
    const client = fakeClient();
    const topicA = "93".repeat(32);
    const topicB = "94".repeat(32);

    try {
      await mesh.join(topicA, client);
      await mesh.join(topicB, client);

      const conn = fakeConn();
      const info = fakePeerInfo([topicA]);
      swarm.emitConnection(conn, info);
      assert.equal(mesh.peerCount(topicA), 1);
      assert.equal(mesh.peerCount(topicB), 0);

      info.emitTopic(topicB);
      assert.equal(mesh.peerCount(topicB), 1);

      conn.emitData(
        encodeSwarmLine({
          type: "frame",
          topicRef: topicB,
          roomId: "room-ok",
          payload: "ZGVsaXZlcmVk",
        }),
      );

      assert.ok(
        client.inbox.some(
          (m) =>
            m.type === "frame" &&
            m.topicRef === topicB &&
            m.payload === "ZGVsaXZlcmVk" &&
            m.roomId === "room-ok",
        ),
      );
    } finally {
      await mesh.destroy();
    }
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
