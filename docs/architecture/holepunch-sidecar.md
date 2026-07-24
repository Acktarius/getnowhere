# Holepunch sidecar (Hyperswarm)

**web app only** for daily `npm run dev`. Desktop uses Electron with the same
bridge contract (`docs/architecture/electron-desktop.md`). Mobile uses a Bare
worklet (`docs/architecture/mobile-p2p-runtime.md`).

Get Now Here is a **static Vite UI plus Pear-shaped P2P runtime** for web-dev:
the React/Vite layer is UI only; Hyperswarm lives in `holepunch-sidecar/`
(Node). The UI never imports `hyperswarm`.

## Networking architecture

- **UI layer:** TypeScript + React + Vite static bundle (browser today).
- **P2P runtime layer (web-dev):** Node sidecar — create swarm, join topics,
  peer streams, reconnect, frame fan-out.
- **Bridge layer:** typed WebSocket messages (schema below). Mobile replaces
  the transport (Bare IPC) but keeps the same command/event types.

### Important constraint

The Vite web app must **not** join Hyperswarm. Browser / plain WebView JS are
UI environments. Hyperswarm requires Bare/Node-class networking (UDP DHT).

### Required implementation rule

All Hyperswarm lifecycle operations happen in the runtime:

- create swarm
- join / leave derived `topicRef`
- accept connections and report peer counts
- multiplex opaque sealed frames
- report state changes to the UI

The React/Vite app only sends commands and renders state.

## Pear / Bare mapping

| Holepunch shape | This repo (web-dev) | Desktop (target) | Mobile (target) |
|---|---|---|---|
| Bare / Pear-end + Hyperswarm | `holepunch-sidecar/src/swarm.mjs` | Electron main / Pear-end | Bare worklet |
| IPC / pear-bridge | `server.mjs` (WebSocket) | Electron IPC / pear-bridge | Bare IPC |
| UI | Vite → `HolepunchChatTransport` | Vite in Electron renderer | Expo UI |

App-layer ChaCha20-Poly1305 seals frames in the app crypto path (L3 E2E). The
sidecar carries **already-sealed** payloads only (no session keys). Hyperswarm
Noise (L2) protects the DHT hop. See `docs/security/encryption.md`.

## Bridge contract (live — implement this)

Canonical types live in `src/services/p2p/HolepunchSidecarClient.ts`.
**Codegen must match these**, not invent alternate `swarm.join` / `chat.send`
unions.

### Client → runtime (commands)

```ts
type SidecarCommand =
  | { type: "ping" }
  | { type: "join"; topicRef: string; roomId: string }
  | { type: "leave"; topicRef: string; roomId: string }
  | { type: "frame"; topicRef: string; roomId: string; payload: string };
```

- `topicRef`: 64 hex chars (32-byte topic).
- `payload`: opaque sealed frame (base64 string today).

### Runtime → client (events)

```ts
type SidecarEvent =
  | { type: "pong" }
  | { type: "ready"; topicRef: string }
  | { type: "peers"; topicRef: string; count: number }
  | { type: "frame"; topicRef: string; roomId?: string; payload: string }
  | { type: "error"; message: string };
```

`connected` for a room is an **app-layer** decision when `peers.count >= 1`
(see `HolepunchChatTransport`), not a separate bridge event.

Mobile Bare IPC must speak this same schema (or a versioned superset documented
here first).

## Pages UI + packaged desktop

Ship path (CI): GitHub Pages hosts the Vite `dist/`; Linux Electron Forge package
bundles Electron + a Node sidecar process and loads that Pages URL. See
`docs/builds/github-pages-and-desktop.md`. Web-dev still uses `npm run holepunch`
+ `npm run dev` without packaging.

## Storage and sync

If replicated history is added later, keep replication in the runtime and expose
state through the bridge. The UI must not import Hypercore/Hyperswarm primitives.

## Layout

```
holepunch-sidecar/
  package.json
  src/swarm.mjs    # one Hyperswarm; multi-topic join + local/remote fan-out
  src/server.mjs   # ws://127.0.0.1:7901 by default
  test/
```

## Run (Alice / Bob on one machine)

Install once:

```bash
npm run holepunch:install
```

Terminal A — sidecar:

```bash
npm run holepunch
```

Terminal B — web app:

```bash
npm run dev
```

Open two browser profiles against the same origin. Both use
`VITE_HOLEPUNCH_WS_URL` (default `ws://127.0.0.1:7901`).

**Dev note:** two UIs on one sidecar share a local fan-out path. That is a
convenience for same-machine testing; cross-machine peers still use the public
DHT via Hyperswarm.

Optional second sidecar:

```bash
HOLEPUNCH_PORT=7902 npm run holepunch
```

Then `VITE_HOLEPUNCH_WS_URL=ws://127.0.0.1:7902` for that profile.

## Connected rule

Transport peer count ≥ 1 is necessary but not sufficient. The UI marks
`connected` only after the **post-connect L1 proof** (sealed `kind: "proof"`
frame) succeeds — see `docs/security/encryption.md`.

## Sidecar WS auth (optional)

When `GNH_SIDECAR_TOKEN` is set, clients must connect with `?token=<value>` or
the upgrade is closed (`4001`). Unset for web-dev (`npm run holepunch`).
Electron main always sets a per-launch token — `docs/architecture/electron-desktop.md`.

## Env

| Variable | Default | Where |
|---|---|---|
| `VITE_HOLEPUNCH_WS_URL` | `ws://127.0.0.1:7901` | Vite web app |
| `HOLEPUNCH_HOST` | `127.0.0.1` | sidecar |
| `HOLEPUNCH_PORT` | `7901` | sidecar |
| `GNH_SIDECAR_TOKEN` | (unset) | sidecar — required when set |

See also:

- `docs/architecture/electron-desktop.md`
- `docs/architecture/mobile-p2p-runtime.md`
- `docs/architecture/pairing-and-topics.md`
- `docs/architecture/pear-runtime.md`
- `docs/security/p2pchatprotocol.md`
