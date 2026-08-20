# Harden sidecar bridge auth off-loopback

## Why

The holepunch sidecar treats `GNH_SIDECAR_TOKEN` as optional and compares it
with non-constant-time equality. Binding `HOLEPUNCH_HOST` off loopback without
a token exposes join/frame control on the LAN. Finding
`.repo-kit/findings/06-bridge-auth.md` (Medium). Web-dev loopback without a
token remains intentional; packaged Electron already injects a per-launch token.

## What Changes

- Fail at process startup (exit before listen) when host is non-loopback and
  `GNH_SIDECAR_TOKEN` is empty.
- When a token is configured, compare client `?token=` with
  `crypto.timingSafeEqual` on equal-length UTF-8 buffers.
- Document loopback exception (`127.0.0.1` / `::1` / `localhost`) vs
  token-required off-loopback.
- Add unit + spawn/WS regression tests for the policy.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `p2p-chat-connectivity`: non-loopback bind requires a sidecar token at
  startup; when a token is set, WebSocket upgrade auth uses timing-safe
  comparison (still via `?token=`).

## Impact

- `holepunch-sidecar/src/auth.mjs` (new), `server.mjs`, sidecar tests,
  `docs/architecture/holepunch-sidecar.md`, finding 06 follow-ups (scope A).
- **No** Electron / Vite UI changes; `?token=` transport unchanged.
- Operators who bind the sidecar to `0.0.0.0` / LAN without a token will see
  an immediate non-zero exit instead of an open unauthenticated listener.
- Deferred: query→header/subprotocol auth; Electron weak shared default
  `gnh-desktop-shared`.
