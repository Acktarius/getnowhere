# Tasks

## 1. Lock sendFrame membership
- [x] 1.1 In `holepunch-sidecar/test/sidecar.test.mjs`, add tests: (a) client
  that never joined cannot fan out via `sendFrame` to another client on an
  active topic or trigger swarm writes; (b) joined client still fans out.
  Verify with `node --test holepunch-sidecar/test/sidecar.test.mjs` (expect
  fail before fix).

- [x] 1.2 In `holepunch-sidecar/src/swarm.mjs` `sendFrame`, return early unless
  `state.localClients.has(client)`. Make 1.1 pass.

## 2. Bridge joined check + docs
- [x] 2.1 In `holepunch-sidecar/src/server.mjs`, normalize `joined` to
  lowercase; reject `frame` with error unless `joined.has(topicRef)`. Update
  `docs/architecture/holepunch-sidecar.md` and rewrite
  `.findings/03-ws-frame-without-join.md` with remediation. Run `forge e2e run`.
