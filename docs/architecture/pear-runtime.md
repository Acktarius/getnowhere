# P2P Runtime Responsibilities

The P2P runtime is the source of truth for Hyperswarm networking.

| Environment | Runtime | Bridge |
|---|---|---|
| Web-dev | Node `holepunch-sidecar/` | WebSocket |
| Desktop (MVP) | Sidecar child owned/attached by Electron | WebSocket (`:7901`) |
| Desktop (release target) | Electron main / Pear-end | IPC / pear-bridge |
| Mobile (target) | Bare worklet (`react-native-bare-kit`) | Bare IPC |

Do not call the Node sidecar “the Pear binary.” It is **Pear-shaped**: same
role as a desktop Pear-end or mobile Bare worklet.

See:

- `docs/architecture/electron-desktop.md`
- `docs/architecture/mobile-p2p-runtime.md`
- `docs/architecture/holepunch-sidecar.md`

## Responsibilities

- initialize and teardown the local runtime
- create and manage the Hyperswarm instance
- join and leave derived `topicRef` topics (32-byte / 64-hex)
- listen for peer connections and emit peer counts
- fan-out opaque sealed frames
- manage retries, reconnects, and network transitions
- optionally persist local / replicated history later

## Non-responsibilities

- visual rendering, routes, presentation UI
- importing into the Vite renderer or Hermes UI bundle as `hyperswarm`
- inventing alternate bridge message types without updating
  `holepunch-sidecar.md` and `HolepunchSidecarClient.ts`
- Nitro / custom native reimplementations of Hyperswarm

App-layer session crypto and “peer verified / room connected” policy live in
the UI services today (`HolepunchChatTransport`, encryption services). The
runtime reports transport facts (`ready`, `peers`, `frame`).

## Suggested internal modules

- `swarm-manager` (today: `swarm.mjs`; desktop/mobile ports of the same logic)
- `topic` validation (64-hex)
- `bridge-server` (WS today; Electron IPC / pear-bridge / Bare IPC later)
- `persistence` (optional)

## Runtime event model (bridge)

High-signal events on the wire:

- `ready` — topic join prepared
- `peers` — other-peer count for a topic
- `frame` — opaque payload
- `error`
- `pong` (keepalive)

App-derived (not necessarily separate bridge events): joining, connected,
reconnecting, peer-verified, message-sent.

## Constraint reminder

UI code only uses the bridge client. Hyperswarm stays in the runtime.
