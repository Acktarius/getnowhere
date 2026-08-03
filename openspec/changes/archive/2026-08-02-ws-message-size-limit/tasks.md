# Tasks

## 1. Config + WS size gates (TDD)

- [x] 1.1 In `holepunch-sidecar/test/server-lifecycle.test.mjs` (or a focused
  sibling test module), add failing tests against a live sidecar WS:
  (a) raw message larger than `maxWsMessageBytes` → `{type:"error"}` with
  message-too-large semantics, then socket close (1009 when observable);
  (b) joined client sends `frame` with `payload` over `maxFramePayloadBytes`
  but wrapper under WS max → payload-too-large error, close, no fan-out to a
  second joined client; (c) under-limit `frame` still delivers. Prefer
  injecting small test limits via a test-only config path or env override if
  already patterned; otherwise temporarily patch config for the suite.
  Verify with `node --test holepunch-sidecar/test/ws-message-size.test.mjs`
  (expect fail before fix).

- [x] 1.2 Extend `config.json` / `config.mjs` with `maxWsMessageBytes` (270336)
  and `maxFramePayloadBytes` (262144). In `server.mjs`: set WSS `maxPayload`;
  reject oversize raw before `JSON.parse`; reject oversize `frame.payload`
  before `mesh.sendFrame`; on either, send error then `ws.close(1009)`.
  Make 1.1 pass.

## 2. Bridge error code map

- [x] 2.1 Add sidecar error map module and wire **all** `{type:"error"}` sends
  in `server.mjs` to `{ type, code, message }` using codes:
  `message_too_large`, `payload_too_large`, `invalid_json`,
  `join_requires_fields`, `leave_requires_topic`, `frame_requires_fields`,
  `frame_requires_join`, `unknown_type`, `sidecar_error`. Transport
  maxPayload close-hook must emit `message_too_large`. Update
  `holepunch-sidecar/test/ws-message-size.test.mjs` to assert `code` (keep
  message as secondary). Add focused tests for at least `invalid_json` and
  `frame_requires_join`. Update `HolepunchSidecarClient` `SidecarServerMessage`
  error variant to include `code`. Tier-2:
  `node --test holepunch-sidecar/test/ws-message-size.test.mjs` (and any new
  sibling) exit 0.

## 3. Docs + finding + product loop

- [x] 3.1 Add `docs/architecture/holepunch-bridge-errors.md` (canonical code
  table, event shape, size close-1009 notes, client guidance). Link from
  `docs/architecture/holepunch-sidecar.md` (events + config keys / WS size)
  and `docs/README.md`. Mark follow-ups done in
  `.repo-kit/findings/05-ws-message-size-limit.md`. Run `forge e2e run`.
