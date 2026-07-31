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
 *   discovery: { flushed: () => Promise<void>, refresh?: (o?: object) => Promise<void>, destroy?: () => Promise<void> } | null
 *   localClients: Set<LocalClient>
 *   remotePeerIds: Set<string>
 *   refreshTimer: ReturnType<typeof setTimeout> | null
 * }} TopicState
 */

/** Short id for log lines — never log full keys/topics. */
function short(hex) {
  return typeof hex === "string" ? hex.slice(0, 8) : "?";
}

/**
 * Re-announce/re-lookup cadence while a topic has zero remote peers.
 * Hyperswarm's own idle re-lookup can be ~10-12 minutes (refresh interval +
 * jitter), which is far slower than a human waiting for "connected". Nudging
 * `discovery.refresh()` re-queries + re-announces so a peer that joins after
 * us is found quickly.
 *
 * Delays escalate but never stop while the topic is joined: the peer may open
 * their room minutes or hours later, and a fixed attempt cap would drop back
 * to that slow internal cycle exactly when they finally show up.
 * @see docs/architecture/holepunch-sidecar.md
 */
const REFRESH_NUDGE_STEPS_MS = [8_000, 8_000, 8_000, 30_000, 30_000, 30_000];
const REFRESH_NUDGE_STEADY_MS = 60_000;

/** Delay before the nudge numbered `attempts + 1` (0-based lookup). */
export function refreshNudgeDelayMs(attempts) {
  return REFRESH_NUDGE_STEPS_MS[attempts] ?? REFRESH_NUDGE_STEADY_MS;
}

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
          dht: { ready: async () => {}, nodes: [] },
          join: () => ({
            flushed: async () => {},
            refresh: async () => {},
            destroy: async () => {},
          }),
          on() {},
          destroy: async () => {},
        }
      : new Hyperswarm());

  // Defensive: Hyperswarm/HyperDHT are EventEmitters. An unhandled 'error'
  // event would otherwise crash this process outright with no trace on the
  // WS bridge — surface it instead.
  swarm.on("error", (err) => {
    console.error(`[swarm] error: ${err?.message ?? err}`);
  });

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
        refreshTimer: null,
      };
      topics.set(topicRef, state);
    }
    return state;
  }

  /**
   * DHT bootstrap only proves we can reach the public rendezvous nodes — a far
   * lower bar than two arbitrary NATs punching a hole to each other.
   * `randomized` (external port varies per destination, aka symmetric NAT) is
   * the classic signature of a NAT that direct holepunch cannot cross without
   * a relay; log it once so a stuck "0 peers" case is diagnosable after the
   * fact instead of indistinguishable from a topic mismatch.
   * @see docs/architecture/holepunch-sidecar.md
   */
  function logNatDiagnostics() {
    const dht = swarm.dht;
    if (!dht || typeof dht.firewalled === "undefined") return;
    const addr = dht.host && dht.port ? `${dht.host}:${dht.port}` : "unknown";
    const note = dht.randomized
      ? " — external port varies per destination (symmetric-NAT signature); direct holepunch to peers is unlikely to succeed without a relay"
      : "";
    console.log(
      `[swarm] NAT: firewalled=${dht.firewalled} randomized=${dht.randomized} reflexive=${addr}${note}`,
    );
  }

  function stopRefreshNudge(state) {
    if (state.refreshTimer) {
      clearTimeout(state.refreshTimer);
      state.refreshTimer = null;
    }
  }

  /**
   * Poke the DHT to re-announce/re-lookup a topic on an escalating delay for as
   * long as it has zero remote peers. Stops on the first adopted peer and
   * resumes if that peer is later lost.
   * @param {string} topicRef
   * @param {TopicState} state
   */
  function startRefreshNudge(topicRef, state) {
    if (disableDiscovery || state.refreshTimer || !state.discovery) return;
    let attempts = 0;

    const schedule = () => {
      if (!state.discovery || state.localClients.size === 0) return;
      state.refreshTimer = setTimeout(tick, refreshNudgeDelayMs(attempts));
    };

    const tick = () => {
      state.refreshTimer = null;
      if (peerCount(topicRef) > 0) return;
      attempts += 1;
      // `swarm.peers` is DHT-discovered candidates network-wide (any topic),
      // not scoped to topicRef — but 0 here means the lookup itself is
      // finding nobody (topic mismatch or DHT propagation), whereas a
      // non-zero count with 0 established peers means the candidate was
      // found and connect/holepunch attempts are failing instead.
      const candidates = swarm.peers?.size ?? 0;
      console.log(
        `[swarm] topic ${short(topicRef)}… still 0 peers (DHT candidates known: ${candidates}) — re-announcing (attempt ${attempts})`,
      );
      state.discovery
        ?.refresh?.({ client: true, server: true })
        ?.catch((err) => {
          console.warn(`[swarm] refresh failed: ${err?.message ?? err}`);
        });
      schedule();
    };

    schedule();
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
    const normalized = topicRef.toLowerCase();
    const state = topics.get(normalized);
    // Only track topics we joined — never seed from unsolicited hellos.
    if (!state || state.localClients.size === 0 || !conn.remotePublicKey) return;
    connTopics.get(conn)?.add(normalized);
    const peerId = b4a.toString(conn.remotePublicKey, "hex");
    const before = state.remotePeerIds.size;
    state.remotePeerIds.add(peerId);
    if (state.remotePeerIds.size !== before) emitPeers(normalized);
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

  swarm.on("connection", (conn, info) => {
    conns.add(conn);
    connTopics.set(conn, new Set());

    const peerId = conn.remotePublicKey
      ? b4a.toString(conn.remotePublicKey, "hex")
      : null;
    console.log(
      `[swarm] connection open peer=${short(peerId)} direction=${info?.client ? "outbound" : "inbound"}`,
    );

    // Hyperswarm-shared topics only — invite already carries topicRef.
    for (const topicBuf of info?.topics || []) {
      adoptRemoteTopic(conn, b4a.toString(topicBuf, "hex"));
    }
    info?.on?.("topic", (topicBuf) => {
      adoptRemoteTopic(conn, b4a.toString(topicBuf, "hex"));
    });

    const lines = createLineReader();
    conn.on("data", (data) => {
      for (const msg of lines.push(data)) {
        if (!msg || typeof msg.topicRef !== "string") continue;

        // Ignore NDJSON hello — do not adopt or advertise topics over the wire.
        if (msg.type === "hello") continue;

        if (msg.type === "frame" && typeof msg.payload === "string") {
          const frameTopic = msg.topicRef.toLowerCase();
          const joined = connTopics.get(conn);
          if (!joined?.has(frameTopic)) continue;
          const state = topics.get(frameTopic);
          if (!state) continue;
          for (const client of state.localClients) {
            client.send({
              type: "frame",
              topicRef: frameTopic,
              roomId: msg.roomId,
              payload: msg.payload,
            });
          }
        }
      }
    });

    conn.on("error", (err) => {
      console.warn(
        `[swarm] connection error peer=${short(peerId)}: ${err?.message ?? err}`,
      );
    });
    conn.once("close", () => {
      console.log(`[swarm] connection closed peer=${short(peerId)}`);
      conns.delete(conn);
      const joined = connTopics.get(conn) ?? new Set();
      connTopics.delete(conn);
      for (const topicRef of joined) {
        const state = topics.get(topicRef);
        if (!state || !peerId) continue;
        state.remotePeerIds.delete(peerId);
        emitPeers(topicRef);
        // Back to zero peers — resume fast re-announce for the reconnect.
        if (peerCount(topicRef) === 0) startRefreshNudge(topicRef, state);
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
      topicRef = topicRef.toLowerCase();
      const state = getTopic(topicRef);
      state.localClients.add(client);

      if (!disableDiscovery && !state.discovery) {
        // Announce only after DHT bootstrap — joining earlier is flaky on LAN/UFW hosts.
        await swarm.dht.ready();
        // dht.ready() resolves even when zero bootstrap nodes were reachable
        // (no error is ever thrown) — an empty routing table here means peers
        // can never be found until outbound UDP / internet reachability is
        // fixed, but nothing upstream would otherwise report that.
        const nodeCount = swarm.dht.nodes?.length ?? 0;
        if (nodeCount === 0) {
          console.warn(
            "[swarm] DHT routing table is empty after bootstrap — outbound UDP to the public HyperDHT bootstrap nodes looks blocked or unreachable; peer discovery cannot work until this resolves",
          );
        } else {
          console.log(`[swarm] DHT bootstrap ok — ${nodeCount} routing node(s)`);
        }
        logNatDiagnostics();
        const topic = b4a.from(topicRef, "hex");
        state.discovery = swarm.join(topic, { client: true, server: true });
        await state.discovery.flushed();
        console.log(`[swarm] topic ${short(topicRef)}… announced (flushed)`);
        startRefreshNudge(topicRef, state);
      }

      // Adopt remotes already Hyperswarm-associated with this topic.
      for (const [conn, joinedTopics] of connTopics) {
        if (!joinedTopics.has(topicRef) || !conn.remotePublicKey) continue;
        state.remotePeerIds.add(b4a.toString(conn.remotePublicKey, "hex"));
      }

      client.send({ type: "ready", topicRef });
      emitPeers(topicRef);
    },

    /**
     * @param {string} topicRef
     * @param {LocalClient} client
     */
    async leave(topicRef, client) {
      topicRef = topicRef.toLowerCase();
      const state = topics.get(topicRef);
      if (!state) return;
      state.localClients.delete(client);
      emitPeers(topicRef);

      if (state.localClients.size === 0) {
        stopRefreshNudge(state);
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
      const topicRef = frame.topicRef.toLowerCase();
      const { roomId, payload } = frame;
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
      for (const state of topics.values()) stopRefreshNudge(state);
      await swarm.destroy();
      topics.clear();
      conns.clear();
      connTopics.clear();
    },
  };
}
