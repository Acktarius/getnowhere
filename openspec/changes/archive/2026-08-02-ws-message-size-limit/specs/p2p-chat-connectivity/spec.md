# Delta for P2p Chat Connectivity

## ADDED Requirements

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
