# Restrict Sidecar Topic Hello

## Why

The holepunch sidecar currently advertises every locally joined Hyperswarm
`topicRef` to every peer connection via NDJSON `{ type: "hello", topicRef }`,
and broadcasts the same hello to all open connections on every `join`. A peer
who only shares room A therefore learns room B’s discovery secret, can join B
on the DHT, inflate peer counts, and disrupt post-connect proof (including
`crypto_mismatch` / session wipe when garbage fails AEAD during the proof
window). Confirmed High finding: `.findings/01-cross-topic.md`.

Topic membership is already known from the SmartMessage invite/accept path.
The swarm stream must not re-advertise which rooms a process has joined.

## What Changes

- Stop all outbound app-level `hello` topic announcements in the sidecar mesh.
- Ignore inbound `hello` for peer adoption and `connTopics` bookkeeping.
- Adopt remote peers only from Hyperswarm `info.topics` / `topic` events for
  topics this process has locally joined.
- Add regression tests proving topic A peers never learn topic B via hello, and
  that forged hellos cannot seed peer counts.
- Update Holepunch / protocol docs so peer presence is documented as
  Hyperswarm topic association only.

## Capabilities

- `p2p-chat-connectivity`: Hyperswarm-only topic association; no cross-topic
  `topicRef` leak via NDJSON hello (delta:
  `specs/p2p-chat-connectivity/spec.md`).

## Impact

Affects `holepunch-sidecar/src/swarm.mjs`, sidecar tests, and connectivity
docs. UI topic derivation, invite crypto, and L3 / SmartMessage fallback are
unchanged. No migration. Residual risk: inbound server connections with empty
`info.topics` rely on later Hyperswarm `topic` events (and product L3/SmartMessage
fallback if discovery fails) — accepted by design.
