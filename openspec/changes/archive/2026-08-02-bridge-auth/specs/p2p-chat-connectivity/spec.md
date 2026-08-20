# Delta for P2p Chat Connectivity

## ADDED Requirements

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
