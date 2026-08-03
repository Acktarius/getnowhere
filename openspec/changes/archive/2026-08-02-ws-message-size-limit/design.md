# Design — Cap WS bridge message / payload size

## Context

See proposal.md — Why. Today `server.mjs` does `JSON.parse(String(raw))` with
no size check; `frame` only type-checks `payload`. Finding 04 already capped
Hyperswarm NDJSON via `maxNdjsonLineBytes` in `config.json` / `config.mjs`.
The WS path is a separate whole-message JSON bridge (not NDJSON reassembly).
Bridge errors are `{ type: "error"; message: string }` only.

## Goals / Non-Goals

**Goals:**

- Fine-grain knobs for whole WS message vs `frame.payload`.
- Reject oversize before parse / before fan-out.
- Error-then-close (1009) for abusive clients.
- Belt-and-suspenders with `ws` `maxPayload`.
- Stable `code` on every bridge error; documented map under `/docs`.

**Non-Goals:**

- UI reconnect UX after close.
- Bridge auth (finding 06) / hello (finding 07).
- Changing NDJSON cap behavior.
- Media / file transfer sizing (reserved `maxFileBytes` remains unused for chat).
- i18n of `message` strings.

## Decisions

- **Decision:** Separate `maxWsMessageBytes` and `maxFramePayloadBytes`.
  - **Alternatives:** (A) reuse `maxNdjsonLineBytes` only; (C) library
    `maxPayload` only.
  - **Rationale:** Operator asked for fine-grain; payload can stay aligned
    with sealed-frame/NDJSON budget while the JSON wrapper has its own ceiling.

- **Decision:** Defaults `maxFramePayloadBytes=262144`,
  `maxWsMessageBytes=270336` (256KiB + 8KiB headroom).
  - **Alternatives:** identical defaults; 1 MiB; env-only.
  - **Rationale:** Matches finding 04 sealed-frame budget; small wrapper
    headroom without inventing a second sealed-frame story.

- **Decision:** Measure with buffer / UTF-8 byte length, not JS `.length`.
  - **Rationale:** Multi-byte UTF-8 must not under-count.

- **Decision:** On oversize, send coded error then `ws.close(1009)`.
  - **Alternatives:** close-only; error-and-keep-open; message-string only.
  - **Rationale:** Operator chose error-then-close; later chose full code map
    so clients do not regex `message`.

- **Decision:** Full bridge error code map (not only size codes).
  - **Shape:** `{ type: "error"; code: string; message: string }`
  - **Codes:** `message_too_large`, `payload_too_large`, `invalid_json`,
    `join_requires_fields`, `leave_requires_topic`, `frame_requires_fields`,
    `frame_requires_join`, `unknown_type`, `sidecar_error`.
  - **Implementation:** small map module in sidecar (e.g. `errors.mjs`) +
    mirrored TS union on `HolepunchSidecarClient`.
  - **Docs:** canonical table in
    `docs/architecture/holepunch-bridge-errors.md`; link from
    `holepunch-sidecar.md` and `docs/README.md`.
  - **Rationale:** Operator chose B (full map) + dedicated `/docs` page.

- **Decision:** Also set `WebSocketServer({ maxPayload: maxWsMessageBytes })`.
  - **Rationale:** Library may refuse huge frames before the handler runs.
  - **Follow-on:** when the library initiates close 1009, best-effort emit
    `{ code: "message_too_large", … }` before completing close (close-hook),
    so the typed-error contract still holds.

## Risks / Trade-offs

- [Risk] Legitimate future payloads over 256 KiB trip the cap → Mitigation:
  raise knobs in config, or use a media path bound by `maxFileBytes`.
- [Risk] `maxPayload` closes before `message` handler → Mitigation: close-hook
  emits coded error; document in bridge-errors doc.
- [Risk] UI may show a disconnected bridge after abuse/bug → Mitigation:
  out of scope; normal chat sizes never hit the limit.
- [Risk] Older clients ignore `code` → Mitigation: keep `message`; additive
  field.

## Migration

Additive: clients keep reading `message`. Prefer `code` going forward.
No change required for normal sealed-frame senders under the defaults.
