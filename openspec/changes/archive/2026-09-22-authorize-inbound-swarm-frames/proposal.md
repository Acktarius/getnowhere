# Authorize inbound swarm frames

## Why

Outbound swarm writes already require `topicRef ∈ connTopics` for a connection.
Inbound NDJSON `frame` messages only check that this process locally joined the
topic. After cross-topic hello removal, peers no longer learn foreign topicRefs
via hello, but a peer who already knows topic B can still inject B-labeled
frames on an A-only Hyperswarm connection (proof-window garbage, presence
noise). Inbound and outbound must use the same allowlist.

## What Changes

- Drop inbound swarm `frame` unless `connTopics` for that connection contains
  the frame’s `topicRef` (silent continue; same as unknown topic).
- Add regression test: connection adopted only for A cannot deliver frames for B.
- Document the inbound/outbound symmetry in holepunch sidecar docs.
- Rewrite `.findings/02-inbound-swarm-frames.md` to match post-01 reality and
  mark remediation.

## Capabilities

- `p2p-chat-connectivity`: inbound frame delivery requires Hyperswarm-shared
  topic association on the connection (`connTopics`).

## Impact

- `holepunch-sidecar/src/swarm.mjs` — one authorization gate on `conn.on("data")`.
- `holepunch-sidecar/test/sidecar.test.mjs` — new regression.
- `docs/architecture/holepunch-sidecar.md` — note inbound allowlist.
- `.findings/02-inbound-swarm-frames.md` — corrected severity and remediation.
- Legitimate multi-topic peers who share A and B via Hyperswarm `topic` events
  continue to exchange frames once both topics are in `connTopics`.
