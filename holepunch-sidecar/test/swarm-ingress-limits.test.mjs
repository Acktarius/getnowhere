/**
 * Remote swarm ingress limits (SEC-2026-021).
 * @see docs/architecture/holepunch-sidecar.md
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSwarmMesh, encodeSwarmLine } from "../src/swarm.mjs";

function fakeHyperswarm() {
  /** @type {Map<string, Function[]>} */
  const handlers = new Map();
  return {
    dht: { ready: async () => {}, nodes: [{}] },
    join: () => ({
      flushed: async () => {},
      refresh: async () => {},
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

function fakeConn(keyByte = 0xab) {
  /** @type {Function[]} */
  const dataHandlers = [];
  /** @type {Function | undefined} */
  let closeHandler;
  let destroyCalls = 0;
  return {
    get destroyCalls() {
      return destroyCalls;
    },
    remotePublicKey: Buffer.alloc(32, keyByte),
    write() {},
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
  };
}

function fakePeerInfo(topicHex, client = false) {
  return {
    client,
    topics: [Buffer.from(topicHex, "hex")],
    on() {},
  };
}

function frameLine(topic, payload = "c2VhbGVk") {
  return encodeSwarmLine({
    type: "frame",
    topicRef: topic,
    roomId: "room-1",
    payload,
  });
}

function forwardedFrames(client) {
  return client.inbox.filter((m) => m.type === "frame");
}

const INGRESS = {
  frame: { capacity: 3, refillPerMs: 0 },
  bytes: { capacity: 1_000_000, refillPerMs: 0 },
};

describe("swarm ingress limits", () => {
  it("drops frames after the per-connection burst and keeps the socket", async () => {
    const swarm = fakeHyperswarm();
    const mesh = createSwarmMesh({
      swarm,
      ingress: INGRESS,
      maxIngressViolations: 8,
    });
    const client = fakeClient();
    const topic = "aa".repeat(32);
    try {
      await mesh.join(topic, client);
      const conn = fakeConn();
      swarm.emitConnection(conn, fakePeerInfo(topic));
      for (let i = 0; i < 5; i++) {
        conn.emitData(frameLine(topic, `p${i}`));
      }
      assert.equal(forwardedFrames(client).length, 3);
      assert.ok(
        client.inbox.some((m) => m.code === "remote_rate_limited"),
        "expected remote_rate_limited",
      );
      assert.equal(conn.destroyCalls, 0);
    } finally {
      await mesh.destroy();
    }
  });

  it("destroys a peer after consecutive frame-limit violations", async () => {
    const swarm = fakeHyperswarm();
    const mesh = createSwarmMesh({
      swarm,
      ingress: INGRESS,
      maxIngressViolations: 3,
    });
    const client = fakeClient();
    const topic = "bb".repeat(32);
    try {
      await mesh.join(topic, client);
      const conn = fakeConn();
      swarm.emitConnection(conn, fakePeerInfo(topic));
      for (let i = 0; i < 6; i++) {
        conn.emitData(frameLine(topic, `p${i}`));
      }
      assert.equal(forwardedFrames(client).length, 3);
      assert.equal(conn.destroyCalls, 1);
    } finally {
      await mesh.destroy();
    }
  });

  it("destroys a peer that exceeds the per-connection byte burst", async () => {
    const topic = "cc".repeat(32);
    const small = frameLine(topic, "aa");
    const swarm = fakeHyperswarm();
    const mesh = createSwarmMesh({
      swarm,
      ingress: {
        frame: { capacity: 40, refillPerMs: 0 },
        bytes: { capacity: small.byteLength, refillPerMs: 0 },
      },
    });
    const client = fakeClient();
    try {
      await mesh.join(topic, client);
      const conn = fakeConn();
      swarm.emitConnection(conn, fakePeerInfo(topic));
      conn.emitData(small);
      assert.equal(forwardedFrames(client).length, 1);
      conn.emitData(frameLine(topic, "bb"));
      assert.equal(forwardedFrames(client).length, 1);
      assert.equal(conn.destroyCalls, 1);
      assert.ok(client.inbox.some((m) => m.code === "remote_rate_limited"));
    } finally {
      await mesh.destroy();
    }
  });

  it("rejects a ninth inbound connection and keeps the first eight", async () => {
    const swarm = fakeHyperswarm();
    const mesh = createSwarmMesh({
      swarm,
      maxRemoteConnections: 8,
      ingress: {
        frame: { capacity: 40, refillPerMs: 0 },
        bytes: { capacity: 1_000_000, refillPerMs: 0 },
      },
    });
    const client = fakeClient();
    const topic = "dd".repeat(32);
    try {
      await mesh.join(topic, client);
      const conns = [];
      for (let i = 0; i < 8; i++) {
        const conn = fakeConn(i + 1);
        conns.push(conn);
        swarm.emitConnection(conn, fakePeerInfo(topic));
        assert.equal(conn.destroyCalls, 0);
      }
      const extra = fakeConn(9);
      swarm.emitConnection(extra, fakePeerInfo(topic));
      assert.equal(extra.destroyCalls, 1);
      conns[0].emitData(frameLine(topic, "keep"));
      assert.ok(forwardedFrames(client).some((m) => m.payload === "keep"));
    } finally {
      await mesh.destroy();
    }
  });

  it("still accepts an outbound connection when the inbound cap is full", async () => {
    const swarm = fakeHyperswarm();
    const mesh = createSwarmMesh({
      swarm,
      maxRemoteConnections: 1,
      ingress: {
        frame: { capacity: 40, refillPerMs: 0 },
        bytes: { capacity: 1_000_000, refillPerMs: 0 },
      },
    });
    const client = fakeClient();
    const topic = "ee".repeat(32);
    try {
      await mesh.join(topic, client);
      const inbound = fakeConn(1);
      swarm.emitConnection(inbound, fakePeerInfo(topic, false));
      assert.equal(inbound.destroyCalls, 0);
      const outbound = fakeConn(2);
      swarm.emitConnection(outbound, fakePeerInfo(topic, true));
      assert.equal(outbound.destroyCalls, 0);
      outbound.emitData(frameLine(topic, "out"));
      assert.ok(forwardedFrames(client).some((m) => m.payload === "out"));
    } finally {
      await mesh.destroy();
    }
  });

  it("forwards a photo-sized payload under the default byte budget", async () => {
    const swarm = fakeHyperswarm();
    const mesh = createSwarmMesh({ swarm });
    const client = fakeClient();
    const topic = "ff".repeat(32);
    try {
      await mesh.join(topic, client);
      const conn = fakeConn();
      swarm.emitConnection(conn, fakePeerInfo(topic));
      const payload = "p".repeat(200_000);
      conn.emitData(frameLine(topic, payload));
      assert.equal(forwardedFrames(client).length, 1);
      assert.equal(conn.destroyCalls, 0);
    } finally {
      await mesh.destroy();
    }
  });
});
