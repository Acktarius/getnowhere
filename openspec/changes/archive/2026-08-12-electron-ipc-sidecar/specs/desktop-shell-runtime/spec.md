## Purpose

Defines how the Electron desktop shell exposes the Hyperswarm sidecar bridge to
the Vite renderer: identity, storage, and local bridge transport for packaged
and dev harness builds.

## ADDED Requirements

### Requirement: Desktop IPC bridge exposes typed sidecar commands

When the Electron shell uses native IPC to reach its sidecar, the preload bridge
SHALL expose `sendCommand` and `onBridgeEvent` on `window.gnhDesktop` using the
same command and event shapes as the mobile `gnhMobile` bridge
(`SidecarClientMessage` / `SidecarServerMessage`). The renderer SHALL NOT open a
WebSocket to the sidecar when `bridgeTransport` is `ipc`.

#### Scenario: IPC desktop renderer uses typed bridge

- GIVEN the Electron shell spawned its sidecar with `GNH_BRIDGE_TRANSPORT=ipc`
- WHEN the renderer loads with sandboxed preload
- THEN `window.gnhDesktop.bridgeTransport` is `ipc`
- AND `window.gnhDesktop.sendCommand` and `onBridgeEvent` are functions
- AND the Holepunch sidecar backend does not create a WebSocket connection

#### Scenario: Web-dev browser still uses WebSocket

- GIVEN the UI runs in a normal browser with `npm run dev`
- AND `window.gnhDesktop` is absent
- WHEN the app connects to the sidecar
- THEN it uses the WebSocket backend at the configured loopback URL

### Requirement: Main process validates renderer bridge commands

The Electron main process SHALL accept sidecar commands only from the window's
registered `webContents` id (same sender gate as `gnh:get-desktop-info`). It
SHALL validate command shape before forwarding to the sidecar IPC socket. It
SHALL NOT expose a generic "forward arbitrary JSON" API to the renderer.

#### Scenario: Foreign webContents cannot send commands

- GIVEN a `gnh:sidecar-command` handler scoped to the main window's webContents
- WHEN another webContents invokes the handler
- THEN the invoke is rejected
- AND nothing is written to the sidecar IPC socket

#### Scenario: Valid join command is forwarded

- GIVEN the main process is connected to the sidecar IPC socket
- WHEN the registered renderer invokes `gnh:sidecar-command` with a valid `join`
- THEN main writes one NDJSON line to the sidecar
- AND sidecar events are delivered back via `gnh:sidecar-event`

### Requirement: Desktop IPC mode does not use wsToken for transport auth

When `bridgeTransport` is `ipc`, the preload bridge SHALL NOT require
`wsToken` for sidecar connectivity. The shell MAY omit `holepunchWsUrl` and
`wsToken` from the desktop info payload in IPC mode. Loopback WebSocket auth
(`wsToken`) SHALL remain unchanged when `bridgeTransport` is `ws` or when
`GNH_HOLEPUNCH_WS_URL` forces WebSocket.

#### Scenario: IPC packaged launch omits ws token requirement

- GIVEN a packaged Electron launch with IPC sidecar transport
- WHEN the renderer reads `window.gnhDesktop`
- THEN `bridgeTransport` is `ipc`
- AND sidecar connectivity does not depend on `wsToken`

#### Scenario: WS override still supports token auth

- GIVEN Electron main forces WebSocket via `GNH_HOLEPUNCH_WS_URL`
- WHEN the renderer connects
- THEN `wsToken` auth behaves as today

### Requirement: Shared dev attach handoff includes IPC path

In non-packaged shared swarm mode, the sidecar owner SHALL write the IPC socket
path to a lockfile under the system temporary directory. An attaching Electron
instance SHALL read that path and connect instead of spawning its own sidecar.

#### Scenario: Bob attaches to Alice IPC sidecar in shared mode

- GIVEN Alice owns the sidecar in shared mode with IPC transport
- AND Alice wrote the IPC path lockfile
- WHEN Bob launches in shared attach mode
- THEN Bob connects to Alice's IPC path
- AND Bob does not spawn a second sidecar

### Requirement: Desktop bridge exposure

The preload bridge SHALL expose sidecar connectivity metadata to the renderer.
When IPC transport is active it SHALL expose `bridgeTransport: "ipc"`,
`sendCommand`, and `onBridgeEvent`. When WebSocket transport is active it SHALL
expose `holepunchWsUrl`, `wsToken`, and `bridgeTransport: "ws"`. It SHALL
expose `ufwState` in both modes. It SHALL expose `role` only when a development
role is in effect. Sandboxed `preload.cjs` SHALL be self-contained (no local
`require`) so `window.gnhDesktop` is always defined in the Electron renderer.

#### Scenario: Preload exposes gnhDesktop under sandbox

- GIVEN the Electron window uses `sandbox: true` and `contextIsolation: true`
- WHEN the renderer evaluates `window.gnhDesktop`
- THEN the value is an object (not `undefined`)
- AND `bridgeTransport` is `"ipc"` or `"ws"`

#### Scenario: IPC bridge omits WebSocket URL

- GIVEN the shell uses IPC sidecar transport
- WHEN the renderer reads `window.gnhDesktop`
- THEN `bridgeTransport` is `ipc`
- AND `sendCommand` and `onBridgeEvent` are present

#### Scenario: WS bridge carries URL and token

- GIVEN the shell uses WebSocket sidecar transport
- WHEN the renderer reads `window.gnhDesktop`
- THEN `bridgeTransport` is `ws`
- AND `holepunchWsUrl` is a non-empty string
- AND `wsToken` is present (may be empty only for open web-dev sidecars)

#### Scenario: Development bridge carries the role

- GIVEN the app is not packaged and `GNH_ROLE` is `bob`
- WHEN the renderer reads `window.gnhDesktop`
- THEN `role` is `bob`
