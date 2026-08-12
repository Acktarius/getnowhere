## ADDED Requirements

### Requirement: Sidecar supports native IPC bridge transport

The holepunch sidecar SHALL support a local bridge transport selected by
`GNH_BRIDGE_TRANSPORT`: `ws` (default) or `ipc`. In `ipc` mode it SHALL listen
on a Unix domain socket (Linux/macOS) or named pipe (Windows) at the path given
by `GNH_IPC_PATH`. It SHALL accept at most one connected IPC client unless
multi-window fan-out is explicitly enabled later. In `ipc` mode it MAY omit
binding the WebSocket server when no loopback TCP bridge is required.

#### Scenario: Web-dev sidecar defaults to WebSocket

- GIVEN `GNH_BRIDGE_TRANSPORT` is unset
- WHEN the sidecar starts
- THEN it listens for WebSocket connections on the configured loopback host and port
- AND it does not require `GNH_IPC_PATH`

#### Scenario: IPC mode listens on the configured path

- GIVEN `GNH_BRIDGE_TRANSPORT=ipc` and `GNH_IPC_PATH` is set
- WHEN the sidecar starts
- THEN it listens on that IPC path
- AND a connected client may send bridge commands

#### Scenario: IPC mode announces path over Node child IPC

- GIVEN the sidecar was spawned with a Node IPC channel and `GNH_BRIDGE_TRANSPORT=ipc`
- WHEN the IPC listener is ready
- THEN it sends `{ type: "listening", transport: "ipc", path }` where `path`
  equals `GNH_IPC_PATH`

### Requirement: IPC bridge messages are size-bounded

The sidecar SHALL apply the same inbound message size limits to IPC NDJSON lines
as to WebSocket bridge messages (`maxWsMessageBytes` and `maxFramePayloadBytes`).
Before `JSON.parse`, it SHALL reject lines whose byte length exceeds
`maxWsMessageBytes`. On oversize it SHALL send `{ type: "error", code, message }`
with `code` `message_too_large` or `payload_too_large` as appropriate, then
end the IPC connection. Other sidecar state (Hyperswarm mesh) SHALL remain
available.

#### Scenario: Oversized IPC line is rejected

- GIVEN an IPC client connected in `ipc` mode
- WHEN the client sends an NDJSON line larger than `maxWsMessageBytes`
- THEN the sidecar does not treat it as a successful bridge command
- AND the client receives `message_too_large`
- AND the IPC connection ends

#### Scenario: Valid IPC frame still fans out

- GIVEN IPC clients A and B have both joined topic T
- WHEN A sends a valid under-limit `frame` for T
- THEN B receives the frame

### Requirement: IPC bridge enforces join-gated frames

The sidecar SHALL apply the same join-gated `frame` rules to IPC clients as to
WebSocket clients.

#### Scenario: Non-joined IPC client cannot inject frames

- GIVEN client A has joined topic T over IPC
- AND client B is connected over IPC but has not joined T
- WHEN B sends a `frame` for T
- THEN A does not receive that frame
- AND the frame is not written to Hyperswarm for T

### Requirement: Stale Unix domain socket is cleaned before bind

On Linux and macOS, when `GNH_BRIDGE_TRANSPORT=ipc`, the sidecar SHALL remove an
existing filesystem entry at `GNH_IPC_PATH` before binding when that path is not
actively in use, so a crash from a prior run does not block startup.

#### Scenario: Restart after crash binds successfully

- GIVEN a stale socket file exists at `GNH_IPC_PATH` from a dead process
- WHEN the sidecar starts in IPC mode
- THEN it binds successfully on that path
- AND announces `{ type: "listening", transport: "ipc", path }`
