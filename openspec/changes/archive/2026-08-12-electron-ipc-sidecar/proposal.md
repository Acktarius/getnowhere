# Electron IPC Sidecar

## Why

Packaged and dev Electron desktop builds today connect the Vite renderer to
`holepunch-sidecar` over `ws://127.0.0.1:<port>` with a capability token. That
works but keeps a TCP listener on loopback, exposes bridge metadata to any local
process that can guess port + token, and duplicates the mobile pattern (typed
in-process bridge) with a weaker transport.

`docs/architecture/local-bridge-transport.md` ranks native IPC (Unix socket /
named pipe) as the best long-term desktop choice. Web-dev should keep WebSocket
for debugging; future browser production may adopt `wss://` separately.

## What Changes

- Sidecar gains a **dual-transport** mode: default `ws` for browser web-dev;
  `ipc` for Electron-spawned sidecars (Unix domain socket on Linux/macOS,
  named pipe on Windows).
- Electron main connects to the sidecar over `net` IPC (NDJSON lines), proxies
  the existing `SidecarClientMessage` / `SidecarServerMessage` schema, and
  exposes a typed renderer bridge on `window.gnhDesktop` (`sendCommand` /
  `onBridgeEvent`) — parity with `window.gnhMobile`.
- Renderer desktop path uses a new `HolepunchSidecarBackend` (Electron IPC);
  it does **not** open WebSocket when IPC transport is active.
- Bootstrap Node child IPC adds `{ type: "listening", transport: "ipc", path }`
  when IPC mode is selected; WS mode unchanged (`host` + `port`).
- `wsToken` is **not** used for IPC transport auth (OS local access control);
  main still validates renderer sender identity.
- Web-dev (`npm run holepunch` + `npm run dev`) unchanged — still `ws://`.
- Docs updated: `local-bridge-transport.md`, `electron-desktop.md`,
  `holepunch-sidecar.md`.

## Capabilities

### New Capabilities

- `desktop-shell-runtime`: Electron desktop typed bridge over main-process IPC
  (no renderer WebSocket when IPC transport is active) — delta at
  `specs/desktop-shell-runtime/spec.md`.

### Modified Capabilities

- `p2p-chat-connectivity`: Sidecar native IPC transport with the same bridge
  message schema, size bounds, join-gating, and listening announcement — delta
  at `specs/p2p-chat-connectivity/spec.md`.

## Impact

**Code:** `holepunch-sidecar/src/` (transport split), `desktop-electron/main.mjs`,
new main-process sidecar IPC client, `desktop-electron/preload.cjs` +
`preload-bridge.cjs`, `src/services/p2p/HolepunchSidecarClient.ts`,
`src/vite-env.d.ts`.

**Tests:** `holepunch-sidecar/test/` IPC parity tests; `desktop-electron/test/`
preload + IPC client unit tests.

**Unchanged:** L1/L2 crypto, topic derivation, Hyperswarm mesh logic, mobile
Bare bridge, browser WebSocket dev path.

## Non-goals

- Removing WebSocket from the sidecar (web-dev depends on it)
- Implementing `wss://` (separate future change)
- Embedding the sidecar inside Electron main
- Mobile / native-wrapper changes
