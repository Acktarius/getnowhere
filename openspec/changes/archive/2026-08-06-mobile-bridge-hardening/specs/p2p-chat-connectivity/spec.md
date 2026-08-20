# Delta for P2p Chat Connectivity — mobile bridge

## ADDED Requirements

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
