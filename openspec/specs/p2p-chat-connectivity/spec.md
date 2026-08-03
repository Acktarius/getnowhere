# P2p Chat Connectivity Spec

## Purpose

Describe this capability.
## Requirements
### Requirement: Bridge frames require prior topic join
The holepunch sidecar SHALL accept a local client `frame` for a `topicRef` only
when that client has previously `join`ed that topic (i.e. the client is in
`state.localClients` for the topic). Otherwise it SHALL NOT fan out the frame
to other local clients or write it to Hyperswarm. The WebSocket bridge SHOULD
reject an unauthorized `frame` with a typed `error` event.

#### Scenario: Non-joined client cannot inject into an active topic
- GIVEN client A has joined topic T
- AND client B is connected to the same mesh but has not joined T
- WHEN B calls `sendFrame` (or sends WS `frame`) for T
- THEN A does not receive that frame
- AND the frame is not written to Hyperswarm for T

#### Scenario: Joined client may still send frames
- GIVEN clients A and B have both joined topic T
- WHEN A sends a frame for T
- THEN B receives the frame

### Requirement: WS bridge messages are size-bounded
The holepunch sidecar SHALL bound inbound WebSocket bridge messages using a
configured `maxWsMessageBytes` (default 270336) and SHALL bound `frame`
`payload` UTF-8 byte length using a configured `maxFramePayloadBytes`
(default 262144). The WebSocket server SHALL also apply `maxWsMessageBytes`
as its transport `maxPayload`. Before `JSON.parse`, the sidecar SHALL reject
raw messages whose byte length exceeds `maxWsMessageBytes`. Before fan-out,
the sidecar SHALL reject `frame` commands whose `payload` exceeds
`maxFramePayloadBytes`. On either oversize condition the sidecar SHALL send
one `{ type: "error", code, message }` to the client and then close that
WebSocket (close code 1009). Oversize raw / transport rejection SHALL use
`code` `message_too_large`. Oversize `frame.payload` SHALL use `code`
`payload_too_large`. Other clients and Hyperswarm connections on the same
sidecar process SHALL remain available. Under-limit messages SHALL continue
to parse and handle as today (including join-gated frames).

#### Scenario: Oversized raw WS message is rejected before parse
- GIVEN a connected WS client
- WHEN the client sends a raw message larger than `maxWsMessageBytes`
- THEN the sidecar does not treat it as a successful bridge command
- AND the client receives an error with `code` `message_too_large`
- AND the WebSocket is closed
- AND no frame is fanned out to peers

#### Scenario: Oversized frame payload is rejected before fan-out
- GIVEN a WS client that has joined topic T
- AND a `frame` wrapper whose total size is ≤ `maxWsMessageBytes`
- WHEN `payload` UTF-8 byte length exceeds `maxFramePayloadBytes`
- THEN the client receives an error with `code` `payload_too_large`
- AND the WebSocket is closed
- AND the frame is not written to Hyperswarm or other local clients

#### Scenario: Under-limit frame still fans out
- GIVEN clients A and B have both joined topic T
- WHEN A sends a `frame` for T with `payload` ≤ `maxFramePayloadBytes`
  and total message ≤ `maxWsMessageBytes`
- THEN B receives the frame

### Requirement: Bridge errors carry a stable code
Every WebSocket bridge `{ type: "error" }` event from the holepunch sidecar
SHALL include a string `code` from the documented bridge error map and a
human-readable `message`. The map SHALL cover at least: `message_too_large`,
`payload_too_large`, `invalid_json`, `join_requires_fields`,
`leave_requires_topic`, `frame_requires_fields`, `frame_requires_join`,
`unknown_type`, and `sidecar_error`. The canonical map SHALL be documented
under `docs/architecture/holepunch-bridge-errors.md`. UI clients SHOULD
discriminate on `code` rather than parsing `message`.

#### Scenario: Invalid JSON yields coded error
- GIVEN a connected WS client
- WHEN the client sends a non-JSON text frame under the size limit
- THEN the client receives `{ type: "error", code: "invalid_json", message: … }`
- AND the connection remains open (unless a separate rule closes it)

#### Scenario: Frame without join yields coded error
- GIVEN a WS client that has not joined topic T
- WHEN the client sends a valid under-limit `frame` for T
- THEN the client receives an error with `code` `frame_requires_join`
- AND the frame is not fanned out

### Requirement: Non-loopback bind requires sidecar token
The holepunch sidecar SHALL refuse to listen when `HOLEPUNCH_HOST` is not a
loopback address and `GNH_SIDECAR_TOKEN` is empty. Refusal SHALL occur before
the WebSocket server begins accepting connections (process exits with a
non-zero status). Loopback hosts for this rule SHALL be exactly `127.0.0.1`,
`::1`, and the hostname `localhost` (ASCII case-insensitive). Binding to
loopback with an empty token SHALL remain allowed (web-dev exception). Binding
to a non-loopback host with a non-empty token SHALL be allowed.

#### Scenario: Non-loopback without token fails before listen
- GIVEN `HOLEPUNCH_HOST` is `0.0.0.0` (or another non-loopback host)
- AND `GNH_SIDECAR_TOKEN` is unset or empty
- WHEN the sidecar process starts
- THEN it exits with a non-zero status
- AND it does not accept WebSocket connections

#### Scenario: Loopback without token still listens
- GIVEN `HOLEPUNCH_HOST` is `127.0.0.1`
- AND `GNH_SIDECAR_TOKEN` is unset or empty
- WHEN the sidecar process starts
- THEN it listens for WebSocket connections as today

#### Scenario: Non-loopback with token listens
- GIVEN `HOLEPUNCH_HOST` is a non-loopback host
- AND `GNH_SIDECAR_TOKEN` is a non-empty value
- WHEN the sidecar process starts
- THEN it listens for WebSocket connections

### Requirement: Sidecar token comparison is timing-safe
When `GNH_SIDECAR_TOKEN` is non-empty, the holepunch sidecar SHALL authenticate
WebSocket upgrades using the `token` query parameter and SHALL accept the
connection only when the presented token matches the required token under a
constant-time comparison of equal-length byte sequences (length mismatch MUST
reject without treating unequal lengths as equal). A missing or incorrect
token SHALL close the WebSocket with close code `4001`. When
`GNH_SIDECAR_TOKEN` is empty and the process is allowed to listen (loopback),
upgrade authentication SHALL remain optional (no token required).

#### Scenario: Wrong token is rejected
- GIVEN the sidecar was started with a non-empty `GNH_SIDECAR_TOKEN`
- WHEN a client connects without a matching `token` query parameter
- THEN the WebSocket is closed with code `4001`

#### Scenario: Correct token is accepted
- GIVEN the sidecar was started with a non-empty `GNH_SIDECAR_TOKEN`
- WHEN a client connects with `token` equal to that value
- THEN the WebSocket upgrade succeeds and bridge commands may proceed

