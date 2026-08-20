# Stabilize Holepunch Fallback

## Why

After an invite is accepted, the room can briefly regress from `connecting` or
`connect_failed` to `pending`. That disables the already-supported L1 chain
fallback even though acceptance has occurred. Repeated room refreshes can also
start overlapping Holepunch connection attempts, producing hundreds of retries.

Two machines on the same LAN still rely on Hyperswarm discovery over UDP and
normally the public DHT. The current 30-second deadline is shorter than observed
discovery times and hides the distinction between Holepunch connection state and
the chain fallback used for messages.

## What Changes

- Preserve monotonic room acceptance: bootstrap data cannot downgrade a
  post-accept lifecycle to `pending`.
- Persist failed connection state and error detail so reloads do not resurrect
  stale lifecycle values.
- Make connection and session restoration single-flight per room, with retry
  backoff rather than overlapping polling attempts.
- Increase the Holepunch discovery deadline to tolerate realistic DHT meet time.
- Clarify that `Connecting` refers to Holepunch while chain delivery is only the
  temporary message fallback.
- Add a Linux Electron advisory when UFW appears enabled and Holepunch repeatedly
  times out, without requesting elevated privileges or claiming a specific port
  is blocked.
- Document LAN requirements and diagnostics: UDP, DHT bootstrap connectivity,
  matching topics, and host firewall behavior.

## Capabilities

- `p2p-chat-connectivity`: Stable post-accept lifecycle, bounded Holepunch
  reconnects, uninterrupted L1 fallback, and accurate connection messaging
  (delta: `specs/p2p-chat-connectivity/spec.md`).

## Impact

The change affects the chat transport lifecycle, durable room catalog, chat
screen polling/copy, connection policy tests, and Holepunch documentation.
The Electron preload bridge gains a read-only host advisory exposed by main;
the sidecar wire format is unchanged. There is no topic-derivation or crypto
change. Existing durable rooms require no migration; monotonic lifecycle
handling repairs stale `pending` values when valid post-accept state is
available.
