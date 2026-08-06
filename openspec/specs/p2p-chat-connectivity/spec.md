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

### Requirement: Mobile RN IPC reassembly is length-bounded
The Expo native wrapper SHALL bound pending BareKit IPC line reassembly in
`GnhMobileBridge` using the same `maxNdjsonLineBytes` default (262144) as the
Bare worklet. When appending would exceed that limit, the bridge SHALL clear its
buffer, terminate the worklet, and reject further IPC until restart.

#### Scenario: Oversized worklet IPC line trips the cap
- GIVEN the Bare worklet is running and connected to `GnhMobileBridge`
- WHEN the worklet sends IPC data without `\n` longer than `maxNdjsonLineBytes`
- THEN the RN bridge clears its line buffer and terminates the worklet
- AND the app may restart the worklet on next room action

#### Scenario: Valid NDJSON events under the cap still parse
- GIVEN a bridge event line whose byte length is ≤ `maxNdjsonLineBytes`
- WHEN the line arrives whole or fragmented across IPC chunks
- THEN `GnhMobileBridge` parses and dispatches it to WebView handlers

### Requirement: Mobile bridge token is non-empty and CSPRNG-backed
The native wrapper SHALL generate a per-launch bridge token using a CSPRNG
(`crypto.randomUUID` or equivalent). It SHALL NOT fall back to `Math.random` or
predictable timestamps. It SHALL refuse to start the Bare worklet when token
generation fails or the token is empty. The Bare worklet SHALL reject startup
when `argv[0]` token is empty and SHALL require a matching token on every IPC
command (no fail-open when token is empty).

#### Scenario: Empty token prevents worklet start
- GIVEN `bridgeToken` is empty
- WHEN the app attempts to start the Bare worklet
- THEN startup fails before Hyperswarm join
- AND no IPC commands are accepted without auth

#### Scenario: Wrong token is rejected
- GIVEN a non-empty bridge token was used to start the worklet
- WHEN a WebView command presents a non-matching token
- THEN the command is not forwarded to the worklet

### Requirement: Mobile WebView bridge ingress is navigation-restricted
The Expo WebView hosting the bundled UI SHALL restrict top-level navigation to
the packaged asset origin (`file:///android_asset/ui/`). It SHALL NOT enable
universal cross-origin access from file URLs unless a documented asset-loading
requirement forces a narrower exception. The bridge secret SHALL NOT be exposed
as a readable property on `window` (commands use an injected closure).

#### Scenario: External URL navigation is blocked
- GIVEN the mobile app WebView is loaded with bundled UI
- WHEN the page attempts top-level navigation to `https://evil.example/`
- THEN navigation is blocked by the native WebView policy

### Requirement: Mobile bridge commands are rate-limited
The Bare worklet bridge session SHALL enforce per-client rate limits on `join`,
`leave`, and `frame` commands. When exceeded, it SHALL respond with
`{ type: "error", code: "rate_limited", message: … }` and SHALL NOT perform the
command.

#### Scenario: Burst join commands are throttled
- GIVEN a connected WebView client with a valid token
- WHEN the client sends join commands faster than the configured limit
- THEN excess commands receive `rate_limited` errors
- AND Hyperswarm is not churned by every excess join

