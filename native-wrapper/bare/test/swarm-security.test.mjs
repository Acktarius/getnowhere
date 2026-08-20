/**
 * Swarm security tests for mobile Bare worklet (no-hello, connTopics gating).
 * Ported from holepunch-sidecar/test/sidecar.test.mjs
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { config } from "../config.mjs";
import {
  createLineReader,
  createSwarmMesh,
  encodeSwarmLine,
} from "../swarm.mjs";

function fakeHyperswarm({ nodes = [{}], refresh = async () => {}, dht = {} } = {}) {
  /** @type {Map<string, Function[]>} */
  const handlers = new Map();
  return {
    dht: { ready: async () => {}, nodes, ...dht },
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

function fakeConn() {
  /** @type {Uint8Array[]} */
  const writes = [];
  /** @type {Function[]} */
  const dataHandlers = [];
  /** @type {Function | undefined} */
  let closeHandler;
  let destroyCalls = 0;
  return {
    writes,
    get destroyCalls() {
      return destroyCalls;
    },
    remotePublicKey: Buffer.from("ab".repeat(32), "hex"),
    write(buf) {
      writes.push(buf);
    },
    destroy() {
      destroyCalls += 1;
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

      const client2 = fakeClient();
      await mesh.leave(topicB, client);
      await mesh.join(topicB, client2);
      assert.equal(mesh.peerCount(topicB), 0);
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

describe("connTopics frame gating", () => {
  it("drops inbound frames for topics not Hyperswarm-shared on the connection", async () => {
    const swarm = fakeHyperswarm();
    const mesh = createSwarmMesh({ swarm });
    const client = fakeClient();
    const topicA = "aa".repeat(32);
    const topicB = "bb".repeat(32);

    try {
      await mesh.join(topicA, client);
      await mesh.join(topicB, client);

      const conn = fakeConn();
      swarm.emitConnection(conn, fakePeerInfo([topicA]));

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
          (m) => m.type === "frame" && m.payload === "aW5qZWN0",
        ),
      );
    } finally {
      await mesh.destroy();
    }
  });

  it("destroys connection when inbound NDJSON exceeds max line length", async () => {
    const swarm = fakeHyperswarm();
    const mesh = createSwarmMesh({ swarm });
    const client = fakeClient();
    const topic = "cc".repeat(32);

    try {
      await mesh.join(topic, client);
      const conn = fakeConn();
      swarm.emitConnection(conn, fakePeerInfo([topic]));
      assert.equal(conn.destroyCalls, 0);

      conn.emitData("x".repeat(config.maxNdjsonLineBytes + 1));

      assert.equal(conn.destroyCalls, 1);
    } finally {
      await mesh.destroy();
    }
  });
});
