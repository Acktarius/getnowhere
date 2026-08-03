# Tasks

## 1. Auth helpers (TDD)

- [x] 1.1 Add `holepunch-sidecar/test/auth.test.mjs` covering `isLoopbackHost`
  (`127.0.0.1`, `::1`, `localhost`/`LOCALHOST` true; `0.0.0.0`, `::`, LAN IP
  false) and `tokensEqual` (match true; wrong / length mismatch false).
  Verify with `node --test holepunch-sidecar/test/auth.test.mjs` (expect fail
  before module exists).

- [x] 1.2 Add `holepunch-sidecar/src/auth.mjs` exporting `isLoopbackHost` and
  `tokensEqual` (UTF-8 buffers; length mismatch → false; else
  `crypto.timingSafeEqual`). Make 1.1 pass.

## 2. Server policy (TDD)

- [x] 2.1 Add spawn/WS tests (extend `server-lifecycle.test.mjs` or a sibling
  `bridge-auth.test.mjs`): (a) `HOLEPUNCH_HOST=0.0.0.0` + empty token →
  non-zero exit, no listen/IPC listening; (b) loopback + empty token →
  listens; (c) non-loopback + token → listens; (d) token set + wrong/missing
  `?token=` → close `4001`; (e) token set + correct `?token=` → connects.
  Prefer reuse of existing `spawnSidecar` helpers. Verify with
  `node --test holepunch-sidecar/test/bridge-auth.test.mjs` (or chosen path;
  expect fail before server wiring).

- [x] 2.2 Wire `server.mjs`: import helpers; before `WebSocketServer`, if
  `!isLoopbackHost(host) && !requiredToken` log (no secret) and
  `process.exit(1)`; replace `!==` with `tokensEqual`. Make 2.1 pass.

## 3. Docs + finding + product loop

- [x] 3.1 Update `docs/architecture/holepunch-sidecar.md` Sidecar WS auth
  section: non-loopback requires token at startup; loopback untokend remains
  explicit web-dev exception; note timing-safe compare. Mark scope-A
  follow-ups done in `.repo-kit/findings/06-bridge-auth.md` (leave deferred
  items open). Run `forge e2e run`.
