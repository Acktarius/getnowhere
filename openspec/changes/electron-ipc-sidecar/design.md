# Design — Electron IPC Sidecar

## Context

See `proposal.md`. Today:

- `holepunch-sidecar/src/server.mjs` hosts the bridge on WebSocket only.
- Electron spawns the sidecar, waits for `{ type: "listening", port }`, passes
  `holepunchWsUrl` + `wsToken` via preload → renderer uses
  `createWebSocketSidecarBackend()`.
- Mobile already uses `gnhMobile.sendCommand` / `onBridgeEvent` →
  `createMobilePostMessageSidecarBackend()`.

Approved: **Approach A + dual transport (option 2)** — IPC for Electron desktop,
WS retained for web-dev.

## Goals / Non-Goals

**Goals:**

- No TCP listener when Electron spawns sidecar in IPC mode
- Same bridge message schema (`SidecarClientMessage` / `SidecarServerMessage`)
- Renderer backend selection: mobile → electron IPC → WebSocket
- Preserve sidecar hardening: size limits, join-gating, parent-death, bind errors
- Alice/Bob dev harness works in IPC mode with distinct socket paths per role

**Non-Goals:**

- `wss://`, removing WS from sidecar, mobile changes, embedding sidecar in main

## Decisions

### D1 — Transport selection via env

`GNH_BRIDGE_TRANSPORT=ws|ipc` (default `ws`).

- Browser web-dev and `npm run holepunch`: unset → `ws`
- Electron `spawnSidecar`: set `ipc` + `GNH_IPC_PATH=<path>` (main generates path)

Alternative rejected: auto-detect from `process.send` alone — explicit env keeps
web-dev and tests predictable.

### D2 — Sidecar: extract shared bridge session handler

Refactor `server.mjs` so WebSocket `connection` and IPC `socket` both call one
`handleBridgeClient(client)` where `client.send(msg)` is transport-specific.
Message parsing, join-gating, mesh fan-out stay unified.

New modules (suggested):

- `holepunch-sidecar/src/ipc-path.mjs` — `resolveIpcPath({ platform, sessionId })`
- `holepunch-sidecar/src/bridge-ipc.mjs` — `createIpcBridgeServer({ path, onClient })`

Alternative rejected: duplicate protocol logic in a second file — drift risk.

### D3 — NDJSON line protocol on IPC socket

One JSON object per line (`\n` delimiter), same as mobile Bare IPC cap pattern.
Apply `maxNdjsonLineBytes` / `maxWsMessageBytes` parity on reassembly; reject
oversize with coded `error` then end the socket.

Alternative rejected: length-prefixed binary framing — unnecessary for local IPC.

### D4 — Bootstrap IPC message

When `GNH_BRIDGE_TRANSPORT=ipc` and `process.send` exists:

```json
{ "type": "listening", "transport": "ipc", "path": "/tmp/gnh-sidecar-<id>.sock" }
```

WS mode unchanged: `{ "type": "listening", "host", "port }`.

Main waits for either shape under bounded timeout before creating the window.

### D5 — IPC path generation (main owns path)

Electron main generates a unique path before spawn:

| Platform | Pattern |
| --- | --- |
| Linux/macOS | `$TMPDIR/gnh-sidecar-<appSessionId>.sock` |
| Windows | `\\.\pipe\gnh-sidecar-<appSessionId>` |

`appSessionId`: packaged → per-launch UUID; dev isolated → role suffix;
dev shared owner → host+role slug. Main passes `GNH_IPC_PATH` to child; child
unlinks stale Unix socket before bind.

Alternative rejected: sidecar picks path and logs it — races when attacher reads
log; main must know path before connect.

### D6 — Electron main sidecar client

New module `desktop-electron/sidecar-ipc-client.mjs`:

- `connectSidecarIpc(path, { timeoutMs })` → `{ send(cmd), onEvent(fn), close() }`
- Retry connect with backoff until listening IPC received or timeout
- Multiplexes NDJSON events to registered handlers; forwards renderer commands

Main registers `ipcMain.handle('gnh:sidecar-command', …)` and
`webContents.send('gnh:sidecar-event', msg)` — **typed** bridge commands only
(join, leave, frame, ping), not arbitrary passthrough.

Alternative rejected: renderer WebSocket to main proxy — keeps TCP port.

### D7 — Preload bridge extension

Extend `window.gnhDesktop`:

```ts
sendCommand(cmd: SidecarClientMessage): void
onBridgeEvent(handler: (msg: SidecarServerMessage) => void): () => void
bridgeTransport: 'ipc' | 'ws'  // signals backend selection
```

When `bridgeTransport === 'ipc'`, omit or ignore `holepunchWsUrl` / `wsToken`
for sidecar connection (may retain `ufwState`, `role`).

Keep `preload.cjs` self-contained (no local `require` under sandbox). Mirror
pure helpers in `preload-bridge.cjs` for unit tests.

IPC channels (suggested):

- `gnh:sidecar-command` (invoke, renderer → main)
- `gnh:sidecar-event` (main → renderer)

Validate `event.sender.id === allowedWebContentsId` (same pattern as
`gnh:get-desktop-info`).

### D8 — UI backend selection

In `HolepunchSidecarClient.ts`:

```ts
function getGnhDesktopBridge(): GnhDesktopBridge | null {
  // detect sendCommand + onBridgeEvent + bridgeTransport === 'ipc'
}
export function createElectronIpcSidecarBackend(): HolepunchSidecarBackend { … }

getHolepunchSidecarBackend():
  injected → mobile → electron IPC → websocket
```

`createElectronIpcSidecarBackend` mirrors mobile backend event wiring (peers,
frames, connection status).

### D9 — Auth on IPC path

- **No `wsToken`** on IPC transport (Perplexity + threat model: UDS/pipe ACL)
- Main validates renderer commands (schema + sender id)
- Optional: main sends one-byte/session nonce to sidecar on connect for
  correlation only — not required for v1 if single client enforced

WS auth unchanged for web-dev and any override forcing WS in Electron
(`GNH_HOLEPUNCH_WS_URL` escape hatch).

### D10 — Dev harness behavior

| Mode | Transport | Notes |
| --- | --- | --- |
| Packaged | IPC | always own sidecar, unique path |
| Dev isolated Alice/Bob | IPC | distinct paths (`7901`/`7902` WS ports no longer needed for bridge — sidecar may skip WS bind in ipc mode) |
| Dev shared attach | IPC | attacher connects to owner's socket path via lockfile handoff (extend token lockfile pattern → `gnh-sidecar-<host>-<role>.ipc`) |

When `GNH_BRIDGE_TRANSPORT=ipc`, sidecar MAY skip WebSocket bind entirely
(no loopback TCP). Web-dev sidecar never sets `ipc`.

Alternative rejected: run both WS and IPC simultaneously in ipc mode — doubles
attack surface without benefit.

### D11 — Shared attach lockfile for IPC path

Extend shared-mode handoff: owner writes `$TMPDIR/gnh-sidecar-<host>-<role>.ipc`
containing the socket path; attacher reads instead of port-probing.

## Risks / Trade-offs

| Risk | Mitigation |
| --- | --- |
| Stale Unix socket after crash | Unlink on startup if path exists and not in use |
| Linux path length limit | Short names under `$TMPDIR` |
| Windows pipe ACL / race | Test concurrent launch; use unique pipe name per session |
| Sandbox preload regression | Self-contained preload; unit tests mirror pure helpers |
| Dual-transport drift | Single `handleBridgeClient` for WS + IPC |
| Shared-mode attacher path | IPC path lockfile parallel to token lockfile |

## Migration Plan

1. Ship sidecar IPC transport behind env (WS default — no web-dev regression)
2. Ship Electron main + preload IPC bridge; default Electron spawn to `ipc`
3. Update docs; manual Alice/Bob + packaged smoke
4. Rollback: set `GNH_BRIDGE_TRANSPORT=ws` in main spawn env (keep WS code path)

No user data migration. `GNH_HOLEPUNCH_WS_URL` override continues to force WS
for debugging.

## Open Questions

None blocking — `wss://` deferred; optional main↔sidecar session nonce deferred
to v1 if single-client enforcement suffices.
