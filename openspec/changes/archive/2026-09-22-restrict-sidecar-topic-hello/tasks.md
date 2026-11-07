# Tasks

## 1. Lock the leak with tests
- [x] 1.1 Extend `fakeHyperswarm` in `holepunch-sidecar/test/sidecar.test.mjs`
  so `on("connection", handler)` is recorded and tests can
  `emitConnection(conn, info)` (EventEmitter or handler map — today’s
  `on() {}` no-op is insufficient). Add regressions proving: (a) while
  locally joined to A and B, a connection whose `info.topics` is only A
  never writes a hello for B (and writes no hellos at all); (b) inbound
  `{ type: "hello", topicRef: B }` does not raise peer count for B or put B
  on that connection’s adopted topics without a Hyperswarm topic event;
  (c) Hyperswarm `info.topics` / `topic` for a locally joined topic still
  raises peer count; (d) after a connection is adopted for A only,
  `join(B)` does not write hello for B on that connection. Verify with
  `npm run holepunch:test` (expect fail before production fix).

## 2. Restrict swarm topic association
- [x] 2.1 Update `holepunch-sidecar/src/swarm.mjs`: remove
  `announceTopicsOnConn` and unfiltered `writeSwarm({ type: "hello" })` on
  `join`; adopt remotes only from Hyperswarm `info.topics` / `topic` for
  locally joined topics; ignore inbound `hello` for adoption; tighten
  `adoptRemoteTopic` so `connTopics` is not pre-seeded for unjoined topics.
  Make task 1.1 tests pass via `npm run holepunch:test`.

## 3. Docs and product-loop evidence
- [x] 3.1 Update `docs/architecture/holepunch-sidecar.md` and
  `docs/security/p2pchatprotocol.md` so peer presence is Hyperswarm topic
  association only (invite already carries `topicRef`; app NDJSON hello is
  not used for discovery). Update `.findings/01-cross-topic.md` residual
  note to record that hello was removed (not merely filtered).
- [x] 3.2 Run `forge e2e run` (sidecar regression product loop) and require a
  green current result. Optionally note manual Alice A+B / Eve-only-A wire
  check in verify evidence.
