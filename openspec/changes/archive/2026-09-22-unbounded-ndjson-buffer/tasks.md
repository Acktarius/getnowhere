# Tasks

## 1. Config + line reader cap (TDD)
- [x] 1.1 In `holepunch-sidecar/test/sidecar.test.mjs`, add tests: (a) partial
  line over max throws and leaves buffer cleared for a subsequent valid line;
  (b) line at max length still parses; (c) over-by-one fails. Verify with
  `node --test holepunch-sidecar/test/sidecar.test.mjs` (expect fail before fix).

- [x] 1.2 Add `holepunch-sidecar/config.json` (`maxNdjsonLineBytes`: 262144,
  `maxFileBytes`: 5242880) and `holepunch-sidecar/src/config.mjs` loader with
  those defaults. Update `createLineReader` in `swarm.mjs` to enforce the cap
  (clear buf + throw). Make 1.1 pass.

## 2. Destroy connection + docs
- [x] 2.1 In the Hyperswarm `conn.on("data")` handler, catch the overflow error,
  log, and `conn.destroy()`. Add a regression that an oversized stream destroys
  a mock connection. Update `docs/architecture/holepunch-sidecar.md` and
  `.findings/04-unbounded-ndjson-buffer.md`. Run `forge e2e run`.
