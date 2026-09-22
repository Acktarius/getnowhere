# Tasks

## 1. Lock the asymmetry with tests
- [x] 1.1 In `holepunch-sidecar/test/sidecar.test.mjs`, add a describe for
  inbound frame authorization: (a) connection adopted only for A while local
  has joined A and B — remote `frame` with topicRef B must not appear in the
  local client inbox; (b) after Hyperswarm `topic` event for B (or
  `info.topics` including B), remote frame for B is delivered. Verify with
  `npm run holepunch:test` (expect fail before production fix).

## 2. Authorize inbound frames
- [x] 2.1 In `holepunch-sidecar/src/swarm.mjs` `conn.on("data")` frame branch,
  continue (silent drop) unless `connTopics.get(conn)?.has(frameTopic)`. Make
  task 1.1 pass via `npm run holepunch:test`.

## 3. Docs and finding
- [x] 3.1 Update `docs/architecture/holepunch-sidecar.md` to state inbound and
  outbound frames both require Hyperswarm-shared `connTopics` membership.
  Rewrite `.findings/02-inbound-swarm-frames.md` (Medium; post-01 threat;
  remediation note; follow-ups checked). Run `forge e2e run` and require green.
