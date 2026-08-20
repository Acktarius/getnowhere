# Cap WS bridge message / payload size

## Why

The holepunch sidecar parses inbound WebSocket bridge messages with no max
length on the raw frame or on `frame.payload`. A local (or token-holding)
client can send huge frames, stressing CPU/memory and amplifying fan-out to
peers. Finding `.repo-kit/findings/05-ws-message-size-limit.md` (Medium).
Hyperswarm NDJSON is already capped (finding 04); the WS path is not.
Bridge errors today are string-only (`message`), which is brittle for clients.

## What Changes

- Add `maxWsMessageBytes` and `maxFramePayloadBytes` to sidecar `config.json`
  (loaded via `config.mjs`), separate knobs for fine-grained tuning.
- Set `WebSocketServer({ maxPayload })` from `maxWsMessageBytes`.
- Reject oversize raw messages before `JSON.parse`; reject oversize
  `frame.payload` before fan-out.
- On oversize: send one `{ type: "error", code, message }` then `ws.close(1009)`.
- Introduce a stable bridge **error code map** for all sidecar WS errors
  (size + existing join/frame/json/unknown/sidecar paths); keep human
  `message` alongside `code`.
- Document the map in `docs/architecture/holepunch-bridge-errors.md` and link
  from `holepunch-sidecar.md` / docs index.
- Update `HolepunchSidecarClient` types; regression tests; finding 05 follow-ups.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `p2p-chat-connectivity`: inbound WS bridge messages and `frame` payloads are
  size-bounded; oversize yields a coded error then disconnect. All bridge
  errors carry a stable `code` from the documented map.

## Impact

- `holepunch-sidecar/config.json`, `src/config.mjs`, `src/server.mjs`, tests,
  `src/services/p2p/HolepunchSidecarClient.ts`,
  `docs/architecture/holepunch-bridge-errors.md`,
  `docs/architecture/holepunch-sidecar.md`, `docs/README.md`, finding 05.
- Normal sealed chat frames (well under 256 KiB) are unaffected.
- Abusive or buggy clients that exceed limits lose the WS connection (UI may
  need to reconnect — reconnect UX is out of scope).
- Clients that only read `message` keep working; prefer switching on `code`.
