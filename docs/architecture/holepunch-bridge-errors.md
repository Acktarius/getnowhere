# Holepunch bridge errors

Canonical map of WebSocket bridge `{ type: "error" }` events from
`holepunch-sidecar/`. Codes are defined in `holepunch-sidecar/src/errors.mjs`
and mirrored on the UI client (`HolepunchSidecarClient`).

Bridge command/event schema: `docs/architecture/holepunch-sidecar.md`.

## Event shape

```ts
{ type: "error"; code: string; message: string }
```

- `code` — stable machine key (switch on this).
- `message` — human-readable default or contextual detail for logs/UI copy.
  Do not regex or parse `message` for control flow.

## Codes

| `code` | Default `message` | When it fires |
|---|---|---|
| `message_too_large` | `message too large` | Raw WS message byte length exceeds `maxWsMessageBytes`, or the `ws` library closes with 1009 via `maxPayload` (close-hook best-effort emit). |
| `payload_too_large` | `payload too large` | Joined client sends `frame` whose `payload` UTF-8 byte length exceeds `maxFramePayloadBytes` (wrapper still under WS max). |
| `invalid_json` | `invalid JSON` | Under-limit text frame fails `JSON.parse`. Connection stays open. |
| `join_requires_fields` | `join requires topicRef and roomId` | `join` missing string `topicRef` or `roomId`. |
| `leave_requires_topic` | `leave requires topicRef` | `leave` missing string `topicRef`. |
| `frame_requires_fields` | `frame requires topicRef and payload` | `frame` missing string `topicRef` or `payload`. |
| `frame_requires_join` | `frame requires join for topicRef` | `frame` for a `topicRef` this socket has not `join`ed. No fan-out. |
| `unknown_type` | `unknown type` | JSON object with unrecognized `type` (message may include the type). |
| `sidecar_error` | `sidecar error` | Unexpected exception while handling a command (message may be the exception text). |

## Size rejection and close 1009

`message_too_large` and `payload_too_large` are **error-then-close**: the sidecar
sends the coded error, then closes that WebSocket with close code **1009**.
Other clients and Hyperswarm connections on the same process stay up.

`WebSocketServer` also sets `maxPayload: maxWsMessageBytes`. The library may
refuse a huge frame before the `message` handler runs and initiate close 1009.
In that path the sidecar close-hook best-effort emits
`{ code: "message_too_large", … }` so the typed-error contract still holds.

Limits live in `holepunch-sidecar/config.json` / `src/config.mjs`
(`maxWsMessageBytes`, `maxFramePayloadBytes`). Defaults match the sealed-frame /
NDJSON budget (256 KiB payload + small JSON wrapper headroom). See
`docs/architecture/holepunch-sidecar.md` § WS size bounds.

## Client guidance

1. Discriminate on `code`.
2. Use `message` for humans and logs only.
3. After `message_too_large` / `payload_too_large`, expect the socket to close
   (1009). Reconnect UX is app-owned; normal sealed-frame chat stays under the
   defaults.

See also: `docs/architecture/holepunch-sidecar.md`,
`docs/security/encryption.md` (L1 sealed frames; no L3).
