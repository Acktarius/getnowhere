/**
 * Hyperswarm topic mesh (Pear worker shape).
 * One Hyperswarm per process. Frames are opaque; no session keys here.
 * @see docs/architecture/holepunch-sidecar.md
 */

import b4a from "b4a";
import Hyperswarm from "hyperswarm";

/**
 * @typedef {{
 *   send: (msg: object) => void
 * }} LocalClient
 */

/**
 * @typedef {{
 *   discovery: { flushed: () => Promise<void>, destroy?: () => Promise<void> } | null
 *   localClients: Set<LocalClient>
 *   remotePeerIds: Set<string>
 * }} TopicState
 */

/** Encode one bridge message as a single NDJSON line (Noise streams coalesce). */
export function encodeSwarmLine(obj) {
  return b4a.from(`${JSON.stringify(obj)}\n`);
}

/**
 * Incremental NDJSON splitter for Hyperswarm connection data.
 * @returns {{ push: (chunk: Uint8Array | string) => object[] }}
 */
export function createLineReader() {
  let buf = "";
  return {
    push(chunk) {
      buf += typeof chunk === "string" ? chunk : b4a.toString(chunk);
      /** @type {object[]} */
      const out = [];
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (!line) continue;
        try {
          out.push(JSON.parse(line));
        } catch {
          /* ignore malformed line */
        }
      }
      return out;
    },
  };
}

/**
 * @param {{
 *   swarm?: { dht?: { ready?: () => Promise<void> }, join?: Function, on?: Function, destroy?: () => Promise<void> }
 *   disableDiscovery?: boolean
 * }} [opts] Test hooks: inject swarm / skip DHT announce for local fan-out tests.
 */
export function createSwarmMesh(opts = {}) {
  const disableDiscovery = opts.disableDiscovery === true;
  const swarm =
    opts.swarm ??
    (disableDiscovery
      ? {
          dht: { ready: async () => {} },
          join: () => ({
            flushed: async () => {},
            destroy: async () => {},
          }),
          on() {},
          destroy: async () => {},
        }
      : new Hyperswarm());
  /** @type {Map<string, TopicState>} */
  const topics = new Map();
  /** @type {Map<object, Set<string>>} */
  const connTopics = new Map();
  /** @type {Set<object>} */
  const conns = new Set();

  function getTopic(topicRef) {
    let state = topics.get(topicRef);
    if (!state) {
      state = {
        discovery: null,
        localClients: new Set(),
        remotePeerIds: new Set(),
      };
      topics.set(topicRef, state);
    }
    return state;
  }

  function peerCount(topicRef) {
    const state = topics.get(topicRef);
    if (!state) return 0;
    const localOthers = Math.max(0, state.localClients.size - 1);
    return localOthers + state.remotePeerIds.size;
  }

  function emitPeers(topicRef) {
    const state = topics.get(topicRef);
    if (!state) return;
    const count = peerCount(topicRef);
    for (const client of state.localClients) {
      client.send({ type: "peers", topicRef, count });
    }
  }

  /**
   * Register a remote peer on a topic shared over this connection.
   * @param {object} conn
   * @param {string} topicRef
   */
  function adoptRemoteTopic(conn, topicRef) {
    if (!/^[0-9a-f]{64}$/i.test(topicRef)) return;
    connTopics.get(conn)?.add(topicRef);
    const state = topics.get(topicRef);
    if (!state || state.localClients.size === 0 || !conn.remotePublicKey) return;
    const peerId = b4a.toString(conn.remotePublicKey, "hex");
    const before = state.remotePeerIds.size;
    state.remotePeerIds.add(peerId);
    if (state.remotePeerIds.size !== before) emitPeers(topicRef);
  }

  function writeSwarm(obj, topicRefFilter) {
    const buf = encodeSwarmLine(obj);
    for (const conn of conns) {
      if (topicRefFilter) {
        const joined = connTopics.get(conn);
        if (!joined?.has(topicRefFilter)) continue;
      }
      try {
        conn.write(buf);
      } catch {
        /* ignore */
      }
    }
  }

  function announceTopicsOnConn(conn) {
    for (const [topicRef, state] of topics) {
      if (state.localClients.size === 0) continue;
      try {
        conn.write(encodeSwarmLine({ type: "hello", topicRef }));
      } catch {
        /* ignore */
      }
    }
  }

  swarm.on("connection", (conn, info) => {
    conns.add(conn);
    connTopics.set(conn, new Set());

    // Hyperswarm already knows shared topics — do not wait only on app hello.
    for (const topicBuf of info?.topics || []) {
      adoptRemoteTopic(conn, b4a.toString(topicBuf, "hex"));
    }
    info?.on?.("topic", (topicBuf) => {
      adoptRemoteTopic(conn, b4a.toString(topicBuf, "hex"));
    });

    announceTopicsOnConn(conn);

    const lines = createLineReader();
    conn.on("data", (data) => {
      for (const msg of lines.push(data)) {
        if (!msg || typeof msg.topicRef !== "string") continue;

        if (msg.type === "hello") {
          adoptRemoteTopic(conn, msg.topicRef);
          continue;
        }

        if (msg.type === "frame" && typeof msg.payload === "string") {
          const state = topics.get(msg.topicRef);
          if (!state) continue;
          for (const client of state.localClients) {
            client.send({
              type: "frame",
              topicRef: msg.topicRef,
              roomId: msg.roomId,
              payload: msg.payload,
            });
          }
        }
      }
    });

    conn.on("error", () => {});
    conn.once("close", () => {
      conns.delete(conn);
      const joined = connTopics.get(conn) ?? new Set();
      connTopics.delete(conn);
      const peerId = conn.remotePublicKey
        ? b4a.toString(conn.remotePublicKey, "hex")
        : null;
      for (const topicRef of joined) {
        const state = topics.get(topicRef);
        if (!state || !peerId) continue;
        state.remotePeerIds.delete(peerId);
        emitPeers(topicRef);
      }
    });
  });

  return {
    /**
     * @param {string} topicRef
     * @param {LocalClient} client
     */
    async join(topicRef, client) {
      if (!/^[0-9a-f]{64}$/i.test(topicRef)) {
        throw new Error("topicRef must be 64 hex chars");
      }
      const state = getTopic(topicRef);
      state.localClients.add(client);

      if (!disableDiscovery && !state.discovery) {
        // Announce only after DHT bootstrap — joining earlier is flaky on LAN/UFW hosts.
        await swarm.dht.ready();
        const topic = b4a.from(topicRef, "hex");
        state.discovery = swarm.join(topic, { client: true, server: true });
        await state.discovery.flushed();
      }

      // Adopt remotes that already hello'd / peerInfo-shared this topic.
      for (const [conn, joinedTopics] of connTopics) {
        if (!joinedTopics.has(topicRef) || !conn.remotePublicKey) continue;
        state.remotePeerIds.add(b4a.toString(conn.remotePublicKey, "hex"));
      }

      writeSwarm({ type: "hello", topicRef });
      client.send({ type: "ready", topicRef });
      emitPeers(topicRef);
    },

    /**
     * @param {string} topicRef
     * @param {LocalClient} client
     */
    async leave(topicRef, client) {
      const state = topics.get(topicRef);
      if (!state) return;
      state.localClients.delete(client);
      emitPeers(topicRef);

      if (state.localClients.size === 0) {
        try {
          await state.discovery?.destroy?.();
        } catch {
          /* ignore */
        }
        state.discovery = null;
        state.remotePeerIds.clear();
        topics.delete(topicRef);
      }
    },

    /**
     * @param {LocalClient} client
     * @param {{ topicRef: string, roomId?: string, payload: string }} frame
     */
    sendFrame(client, frame) {
      const { topicRef, roomId, payload } = frame;
      const state = topics.get(topicRef);
      if (!state) return;

      for (const other of state.localClients) {
        if (other === client) continue;
        other.send({
          type: "frame",
          topicRef,
          roomId,
          payload,
        });
      }

      writeSwarm(
        {
          type: "frame",
          topicRef,
          roomId,
          payload,
        },
        topicRef,
      );
    },

    /**
     * Drop a client from every topic (socket closed).
     * @param {LocalClient} client
     */
    async removeClient(client) {
      const topicRefs = [...topics.keys()];
      for (const topicRef of topicRefs) {
        await this.leave(topicRef, client);
      }
    },

    peerCount,
    async destroy() {
      await swarm.destroy();
      topics.clear();
      conns.clear();
      connTopics.clear();
    },
  };
}
