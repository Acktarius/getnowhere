/**
 * Hyperswarm topic mesh (Pear worker shape).
 * One Hyperswarm per process. Frames are opaque; no session keys here.
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

export function createSwarmMesh() {
  const swarm = new Hyperswarm();
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

  function writeSwarm(obj, topicRefFilter) {
    const buf = b4a.from(JSON.stringify(obj));
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
        conn.write(b4a.from(JSON.stringify({ type: "hello", topicRef })));
      } catch {
        /* ignore */
      }
    }
  }

  swarm.on("connection", (conn) => {
    conns.add(conn);
    connTopics.set(conn, new Set());
    announceTopicsOnConn(conn);

    conn.on("data", (data) => {
      let msg;
      try {
        msg = JSON.parse(b4a.toString(data));
      } catch {
        return;
      }
      if (!msg || typeof msg.topicRef !== "string") return;

      if (msg.type === "hello") {
        const peerId = b4a.toString(conn.remotePublicKey, "hex");
        connTopics.get(conn)?.add(msg.topicRef);
        const state = topics.get(msg.topicRef);
        if (state && state.localClients.size > 0) {
          state.remotePeerIds.add(peerId);
          emitPeers(msg.topicRef);
        }
        return;
      }

      if (msg.type === "frame" && typeof msg.payload === "string") {
        const state = topics.get(msg.topicRef);
        if (!state) return;
        for (const client of state.localClients) {
          client.send({
            type: "frame",
            topicRef: msg.topicRef,
            roomId: msg.roomId,
            payload: msg.payload,
          });
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

      if (!state.discovery) {
        const topic = b4a.from(topicRef, "hex");
        state.discovery = swarm.join(topic, { client: true, server: true });
        await state.discovery.flushed();
      }

      // Adopt remotes that already hello'd this topic before we joined.
      for (const [conn, joinedTopics] of connTopics) {
        if (!joinedTopics.has(topicRef) || !conn.remotePublicKey) continue;
        state.remotePeerIds.add(b4a.toString(conn.remotePublicKey, "hex"));
      }

      writeSwarm({ type: "hello", topicRef }); // announce to all conns (discovery)
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
