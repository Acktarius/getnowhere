/**
 * Browser client for the Holepunch Hyperswarm sidecar (WebSocket bridge).
 * Opaque sealed frames only — no session keys on the wire to the sidecar.
 */
import { isAppAccessLocked } from "@/lib/mobile/AppAccessController";
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";

/** Stable bridge error codes from holepunch-sidecar/src/errors.mjs */
export type SidecarBridgeErrorCode =
  | "message_too_large"
  | "payload_too_large"
  | "invalid_json"
  | "join_requires_fields"
  | "leave_requires_topic"
  | "frame_requires_fields"
  | "frame_requires_join"
  | "unknown_type"
  | "sidecar_error";

export type SidecarServerMessage =
  | { type: "ready"; topicRef: string }
  | { type: "peers"; topicRef: string; count: number }
  | { type: "frame"; topicRef: string; roomId?: string; payload: string }
  | { type: "pong" }
  | { type: "error"; code: SidecarBridgeErrorCode | string; message: string };

export type SidecarClientMessage =
  | { type: "join"; topicRef: string; roomId: string }
  | { type: "leave"; topicRef: string; roomId: string }
  | { type: "frame"; topicRef: string; roomId: string; payload: string }
  | { type: "ping" };

export type HolepunchSidecarBackend = {
  ensureConnected(): Promise<void>;
  join(topicRef: string, roomId: string): Promise<void>;
  leave(topicRef: string, roomId: string): Promise<void>;
  sendFrame(topicRef: string, roomId: string, payload: string): void;
  /** Other peers on topic (local WS others + remote DHT). Never includes self alone. */
  getPeerCount(topicRef: string): number;
  onPeers(handler: (topicRef: string, count: number) => void): () => void;
  onFrame(
    handler: (msg: {
      topicRef: string;
      roomId: string;
      payload: string;
    }) => void,
  ): () => void;
  onConnectionStatus(
    handler: (status: "online" | "offline", detail?: string) => void,
  ): () => void;
  close(): void;
};

const DEFAULT_WS_URL = "ws://127.0.0.1:7901";

/** Append `?token=` for Electron sidecar auth. @see docs/architecture/electron-desktop.md */
function appendToken(baseUrl: string, token: string): string {
  if (!token) return baseUrl;
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}token=${encodeURIComponent(token)}`;
}

/**
 * Read-only Electron-Linux advisory ("active" | "inactive" | "unknown").
 * Absent (→ "unknown") in the browser build; never used to imply a specific
 * port is blocked. @see docs/architecture/electron-desktop.md
 */
export function getUfwAdvisoryState(): "active" | "inactive" | "unknown" {
  try {
    if (typeof window !== "undefined") {
      const bridge = window.gnhDesktop;
      if (bridge?.ufwState) return bridge.ufwState;
    }
  } catch {
    /* non-dom */
  }
  return "unknown";
}

export function getHolepunchWsUrl(): string {
  try {
    if (typeof window !== "undefined") {
      const bridge = window.gnhDesktop;
      if (bridge?.bridgeTransport === "ipc") {
        return DEFAULT_WS_URL;
      }
      if (bridge) {
        const base =
          bridge.holepunchWsUrl?.trim() ||
          import.meta.env?.VITE_HOLEPUNCH_WS_URL?.trim() ||
          DEFAULT_WS_URL;
        const token = bridge.wsToken?.trim() ?? "";
        // Prefer reassembling from token so a truncated ?query cannot strand us.
        if (token) return appendToken(base.split("?")[0], token);
        if (bridge.holepunchWsUrl?.trim()) return bridge.holepunchWsUrl.trim();
      }
    }
  } catch {
    /* non-dom */
  }
  try {
    const env = import.meta.env?.VITE_HOLEPUNCH_WS_URL;
    if (typeof env === "string" && env.trim()) return env.trim();
  } catch {
    /* non-vite */
  }
  return DEFAULT_WS_URL;
}

/** Local bridge label for diagnostics (IPC vs WebSocket URL). */
export function getSidecarBridgeDiagnostic(): string {
  try {
    if (typeof window !== "undefined") {
      if (
        window.gnhMobile &&
        typeof window.gnhMobile.sendCommand === "function"
      ) {
        return "bare ipc (mobile worklet)";
      }
      const bridge = window.gnhDesktop;
      if (bridge?.bridgeTransport === "ipc") {
        return "native ipc (Electron main → sidecar)";
      }
    }
  } catch {
    /* non-dom */
  }
  return getHolepunchWsUrl();
}

type PeerHandler = (topicRef: string, count: number) => void;
type FrameHandler = (msg: {
  topicRef: string;
  roomId: string;
  payload: string;
}) => void;
type StatusHandler = (status: "online" | "offline", detail?: string) => void;

function getGnhMobileBridge(): GnhMobileBridge | null {
  try {
    const bridge = window.gnhMobile;
    if (
      typeof window !== "undefined" &&
      bridge &&
      typeof bridge.sendCommand === "function" &&
      typeof bridge.onBridgeEvent === "function"
    ) {
      return bridge;
    }
  } catch {
    /* non-dom */
  }
  return null;
}

function getGnhDesktopIpcBridge(): GnhDesktopBridge | null {
  try {
    const bridge = window.gnhDesktop;
    if (
      typeof window !== "undefined" &&
      bridge?.bridgeTransport === "ipc" &&
      typeof bridge.sendCommand === "function" &&
      typeof bridge.onBridgeEvent === "function"
    ) {
      return bridge;
    }
  } catch {
    /* non-dom */
  }
  return null;
}

/** Shared postMessage-style backend for mobile + Electron IPC bridges. */
function createPostMessageStyleSidecarBackend(bridge: {
  sendCommand: GnhMobileBridge["sendCommand"];
  onBridgeEvent: GnhMobileBridge["onBridgeEvent"];
}): HolepunchSidecarBackend {
  const peerCounts = new Map<string, number>();
  const peerHandlers = new Set<PeerHandler>();
  const frameHandlers = new Set<FrameHandler>();
  const statusHandlers = new Set<StatusHandler>();
  const joined = new Map<string, string>();
  let online = false;

  function emitStatus(status: "online" | "offline", detail?: string): void {
    online = status === "online";
    for (const h of statusHandlers) h(status, detail);
  }

  function handleEvent(msg: SidecarServerMessage): void {
    if (msg.type === "peers") {
      peerCounts.set(msg.topicRef, msg.count);
      for (const h of peerHandlers) h(msg.topicRef, msg.count);
    } else if (msg.type === "frame" && msg.roomId && msg.payload) {
      for (const h of frameHandlers) {
        h({
          topicRef: msg.topicRef,
          roomId: msg.roomId,
          payload: msg.payload,
        });
      }
    } else if (msg.type === "pong" && !online) {
      emitStatus("online");
    } else if (msg.type === "error") {
      const detail = msg.code
        ? `${msg.code}: ${msg.message || "sidecar error"}`
        : msg.message || "sidecar error";
      emitStatus("offline", detail);
    }
  }

  const offBridge = bridge.onBridgeEvent((raw) => {
    handleEvent(raw as SidecarServerMessage);
  });

  function send(msg: SidecarClientMessage): void {
    if (isMobileHost() && isAppAccessLocked()) {
      throw new Error("App access locked");
    }
    bridge.sendCommand(msg);
  }

  return {
    async ensureConnected() {
      if (online) return;
      emitStatus("online");
      send({ type: "ping" });
    },

    async join(topicRef, roomId) {
      await this.ensureConnected();
      joined.set(topicRef, roomId);
      send({ type: "join", topicRef, roomId });
    },

    async leave(topicRef, roomId) {
      joined.delete(topicRef);
      peerCounts.delete(topicRef);
      if (!online) return;
      try {
        send({ type: "leave", topicRef, roomId });
      } catch {
        /* ignore */
      }
    },

    sendFrame(topicRef, roomId, payload) {
      send({ type: "frame", topicRef, roomId, payload });
    },

    getPeerCount(topicRef) {
      return peerCounts.get(topicRef) ?? 0;
    },

    onPeers(handler) {
      peerHandlers.add(handler);
      return () => {
        peerHandlers.delete(handler);
      };
    },

    onFrame(handler) {
      frameHandlers.add(handler);
      return () => {
        frameHandlers.delete(handler);
      };
    },

    onConnectionStatus(handler) {
      statusHandlers.add(handler);
      return () => {
        statusHandlers.delete(handler);
      };
    },

    close() {
      offBridge();
      joined.clear();
      peerCounts.clear();
      online = false;
    },
  };
}

/** Electron desktop IPC backend (main process proxies native sidecar socket). */
export function createElectronIpcSidecarBackend(): HolepunchSidecarBackend {
  const bridge = getGnhDesktopIpcBridge();
  if (!bridge?.sendCommand || !bridge.onBridgeEvent) {
    throw new Error("gnhDesktop IPC bridge missing");
  }
  return createPostMessageStyleSidecarBackend({
    sendCommand: bridge.sendCommand.bind(bridge),
    onBridgeEvent: bridge.onBridgeEvent.bind(bridge),
  });
}

/** Mobile WebView postMessage backend (Bare worklet via Expo shell). */
export function createMobilePostMessageSidecarBackend(): HolepunchSidecarBackend {
  const maybeBridge = getGnhMobileBridge();
  if (!maybeBridge) {
    throw new Error("gnhMobile bridge missing");
  }
  return createPostMessageStyleSidecarBackend(maybeBridge);
}

/** Production WebSocket backend. */
export function createWebSocketSidecarBackend(
  url: string = getHolepunchWsUrl(),
): HolepunchSidecarBackend {
  let ws: WebSocket | null = null;
  let connectPromise: Promise<void> | null = null;
  const peerCounts = new Map<string, number>();
  const peerHandlers = new Set<PeerHandler>();
  const frameHandlers = new Set<FrameHandler>();
  const statusHandlers = new Set<StatusHandler>();
  /** topicRef → roomId (last join) */
  const joined = new Map<string, string>();

  function emitStatus(status: "online" | "offline", detail?: string): void {
    for (const h of statusHandlers) h(status, detail);
  }

  function handleMessage(raw: string): void {
    let msg: SidecarServerMessage;
    try {
      msg = JSON.parse(raw) as SidecarServerMessage;
    } catch {
      return;
    }
    if (msg.type === "peers") {
      peerCounts.set(msg.topicRef, msg.count);
      for (const h of peerHandlers) h(msg.topicRef, msg.count);
    } else if (msg.type === "frame" && msg.roomId && msg.payload) {
      for (const h of frameHandlers) {
        h({
          topicRef: msg.topicRef,
          roomId: msg.roomId,
          payload: msg.payload,
        });
      }
    } else if (msg.type === "error") {
      const detail = msg.code
        ? `${msg.code}: ${msg.message || "sidecar error"}`
        : msg.message || "sidecar error";
      emitStatus("offline", detail);
    }
  }

  function send(msg: SidecarClientMessage): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("Holepunch sidecar offline");
    }
    ws.send(JSON.stringify(msg));
  }

  return {
    async ensureConnected() {
      if (ws?.readyState === WebSocket.OPEN) return;
      if (connectPromise) return connectPromise;

      connectPromise = new Promise<void>((resolve, reject) => {
        try {
          ws = new WebSocket(url);
        } catch (e) {
          connectPromise = null;
          emitStatus(
            "offline",
            e instanceof Error ? e.message : "sidecar unreachable",
          );
          reject(
            new Error(
              e instanceof Error ? e.message : "Holepunch sidecar unreachable",
            ),
          );
          return;
        }

        const onOpen = () => {
          cleanup();
          emitStatus("online");
          // Re-join topics after reconnect
          for (const [topicRef, roomId] of joined) {
            try {
              send({ type: "join", topicRef, roomId });
            } catch {
              /* ignore */
            }
          }
          resolve();
        };
        const onError = () => {
          cleanup();
          connectPromise = null;
          emitStatus("offline", "Holepunch sidecar offline");
          reject(new Error("Holepunch sidecar offline"));
        };
        const onClose = () => {
          ws = null;
          connectPromise = null;
          emitStatus("offline", "Holepunch sidecar offline");
        };
        const onMessage = (ev: MessageEvent) => {
          handleMessage(String(ev.data));
        };

        function cleanup() {
          ws?.removeEventListener("open", onOpen);
          ws?.removeEventListener("error", onError);
        }

        ws.addEventListener("open", onOpen);
        ws.addEventListener("error", onError);
        ws.addEventListener("close", onClose);
        ws.addEventListener("message", onMessage);
      });

      try {
        await connectPromise;
      } finally {
        connectPromise = null;
      }
    },

    async join(topicRef, roomId) {
      await this.ensureConnected();
      joined.set(topicRef, roomId);
      send({ type: "join", topicRef, roomId });
    },

    async leave(topicRef, roomId) {
      joined.delete(topicRef);
      peerCounts.delete(topicRef);
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      try {
        send({ type: "leave", topicRef, roomId });
      } catch {
        /* ignore */
      }
    },

    sendFrame(topicRef, roomId, payload) {
      send({ type: "frame", topicRef, roomId, payload });
    },

    getPeerCount(topicRef) {
      return peerCounts.get(topicRef) ?? 0;
    },

    onPeers(handler) {
      peerHandlers.add(handler);
      return () => {
        peerHandlers.delete(handler);
      };
    },

    onFrame(handler) {
      frameHandlers.add(handler);
      return () => {
        frameHandlers.delete(handler);
      };
    },

    onConnectionStatus(handler) {
      statusHandlers.add(handler);
      return () => {
        statusHandlers.delete(handler);
      };
    },

    close() {
      joined.clear();
      peerCounts.clear();
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      ws = null;
      connectPromise = null;
    },
  };
}

/**
 * In-memory backend for unit tests (no DHT / no WebSocket).
 * Two joins on the same topic → peer count 1 and frame fan-out.
 */
export function createMemorySidecarBackend(): HolepunchSidecarBackend {
  type Client = {
    topics: Map<string, string>;
    peerHandlers: Set<PeerHandler>;
    frameHandlers: Set<FrameHandler>;
  };

  const clients = new Set<Client>();
  let active: Client | null = null;
  const statusHandlers = new Set<StatusHandler>();

  function peerCount(topicRef: string): number {
    let n = 0;
    for (const c of clients) {
      if (c.topics.has(topicRef)) n += 1;
    }
    return Math.max(0, n - 1);
  }

  function emitPeers(topicRef: string): void {
    const count = peerCount(topicRef);
    for (const c of clients) {
      if (!c.topics.has(topicRef)) continue;
      for (const h of c.peerHandlers) h(topicRef, count);
    }
  }

  function ensureClient(): Client {
    if (!active) {
      active = {
        topics: new Map(),
        peerHandlers: new Set(),
        frameHandlers: new Set(),
      };
      clients.add(active);
    }
    return active;
  }

  return {
    async ensureConnected() {
      ensureClient();
      for (const h of statusHandlers) h("online");
    },

    async join(topicRef, roomId) {
      const c = ensureClient();
      c.topics.set(topicRef, roomId);
      emitPeers(topicRef);
    },

    async leave(topicRef, _roomId) {
      const c = active;
      if (!c) return;
      c.topics.delete(topicRef);
      emitPeers(topicRef);
    },

    sendFrame(topicRef, roomId, payload) {
      const sender = active;
      for (const c of clients) {
        if (c === sender) continue;
        if (!c.topics.has(topicRef)) continue;
        for (const h of c.frameHandlers) {
          h({ topicRef, roomId, payload });
        }
      }
    },

    getPeerCount(topicRef) {
      return peerCount(topicRef);
    },

    onPeers(handler) {
      const c = ensureClient();
      c.peerHandlers.add(handler);
      return () => {
        c.peerHandlers.delete(handler);
      };
    },

    onFrame(handler) {
      const c = ensureClient();
      c.frameHandlers.add(handler);
      return () => {
        c.frameHandlers.delete(handler);
      };
    },

    onConnectionStatus(handler) {
      statusHandlers.add(handler);
      return () => {
        statusHandlers.delete(handler);
      };
    },

    close() {
      if (active) {
        clients.delete(active);
        active = null;
      }
    },
  };
}

/**
 * Test backend that simulates a remote peer as soon as join succeeds.
 * Used when the transport singleton cannot host two real peers.
 */
export function createAutoPeerSidecarBackend(): HolepunchSidecarBackend {
  const peerCounts = new Map<string, number>();
  const peerHandlers = new Set<PeerHandler>();
  const frameHandlers = new Set<FrameHandler>();
  const statusHandlers = new Set<StatusHandler>();
  const joined = new Map<string, string>();

  return {
    async ensureConnected() {
      for (const h of statusHandlers) h("online");
    },
    async join(topicRef, roomId) {
      joined.set(topicRef, roomId);
      peerCounts.set(topicRef, 1);
      for (const h of peerHandlers) h(topicRef, 1);
    },
    async leave(topicRef) {
      joined.delete(topicRef);
      peerCounts.set(topicRef, 0);
      for (const h of peerHandlers) h(topicRef, 0);
    },
    sendFrame(_topicRef, _roomId, _payload) {
      /* no peer to deliver to in auto-peer stub */
    },
    getPeerCount(topicRef) {
      return peerCounts.get(topicRef) ?? 0;
    },
    onPeers(handler) {
      peerHandlers.add(handler);
      return () => {
        peerHandlers.delete(handler);
      };
    },
    onFrame(handler) {
      frameHandlers.add(handler);
      return () => {
        frameHandlers.delete(handler);
      };
    },
    onConnectionStatus(handler) {
      statusHandlers.add(handler);
      return () => {
        statusHandlers.delete(handler);
      };
    },
    close() {
      joined.clear();
      peerCounts.clear();
    },
  };
}

/** Shared memory mesh so two transport instances can meet in tests. */
export function createSharedMemorySidecarPair(): [
  HolepunchSidecarBackend,
  HolepunchSidecarBackend,
] {
  type Entry = {
    topics: Map<string, string>;
    peerHandlers: Set<PeerHandler>;
    frameHandlers: Set<FrameHandler>;
    statusHandlers: Set<StatusHandler>;
  };

  const entries: Entry[] = [];

  function peerCount(topicRef: string, self: Entry): number {
    let others = 0;
    for (const e of entries) {
      if (e === self) continue;
      if (e.topics.has(topicRef)) others += 1;
    }
    return others;
  }

  function emitPeers(topicRef: string): void {
    for (const e of entries) {
      if (!e.topics.has(topicRef)) continue;
      const count = peerCount(topicRef, e);
      for (const h of e.peerHandlers) h(topicRef, count);
    }
  }

  function makeBackend(): HolepunchSidecarBackend {
    const entry: Entry = {
      topics: new Map(),
      peerHandlers: new Set(),
      frameHandlers: new Set(),
      statusHandlers: new Set(),
    };
    entries.push(entry);

    return {
      async ensureConnected() {
        for (const h of entry.statusHandlers) h("online");
      },
      async join(topicRef, roomId) {
        entry.topics.set(topicRef, roomId);
        emitPeers(topicRef);
      },
      async leave(topicRef) {
        entry.topics.delete(topicRef);
        emitPeers(topicRef);
      },
      sendFrame(topicRef, roomId, payload) {
        for (const e of entries) {
          if (e === entry) continue;
          if (!e.topics.has(topicRef)) continue;
          for (const h of e.frameHandlers) {
            h({ topicRef, roomId, payload });
          }
        }
      },
      getPeerCount(topicRef) {
        return peerCount(topicRef, entry);
      },
      onPeers(handler) {
        entry.peerHandlers.add(handler);
        return () => {
          entry.peerHandlers.delete(handler);
        };
      },
      onFrame(handler) {
        entry.frameHandlers.add(handler);
        return () => {
          entry.frameHandlers.delete(handler);
        };
      },
      onConnectionStatus(handler) {
        entry.statusHandlers.add(handler);
        return () => {
          entry.statusHandlers.delete(handler);
        };
      },
      close() {
        const idx = entries.indexOf(entry);
        if (idx >= 0) entries.splice(idx, 1);
        for (const topicRef of entry.topics.keys()) {
          emitPeers(topicRef);
        }
        entry.topics.clear();
      },
    };
  }

  return [makeBackend(), makeBackend()];
}

let injectedBackend: HolepunchSidecarBackend | null = null;
let defaultBackend: HolepunchSidecarBackend | null = null;

/** Test hook: inject memory/mock backend. Pass null to clear. */
export function __setHolepunchSidecarBackend(
  backend: HolepunchSidecarBackend | null,
): void {
  injectedBackend?.close();
  injectedBackend = backend;
  defaultBackend?.close();
  defaultBackend = null;
}

export function getHolepunchSidecarBackend(): HolepunchSidecarBackend {
  if (injectedBackend) return injectedBackend;
  if (!defaultBackend) {
    defaultBackend = getGnhMobileBridge()
      ? createMobilePostMessageSidecarBackend()
      : getGnhDesktopIpcBridge()
        ? createElectronIpcSidecarBackend()
        : createWebSocketSidecarBackend();
  }
  return defaultBackend;
}
