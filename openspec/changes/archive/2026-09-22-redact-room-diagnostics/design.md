## Context

See proposal.md — Why. The shipped `roomId` is 4 bytes / 8 hex chars.
`shortTopicRef` already exists in `src/utils/format.ts` (8……8 mask for 64-hex
refs). The diagnostics sheets are purely presentational; no state or service
layer changes are required.

## Goals / Non-Goals

**Goals:**
- Truncated room id helper lives beside `shortTopicRef` in `format.ts`.
- Both sheet call sites pass truncated values; raw capability never reaches JSX
  or clipboard.

**Non-Goals:**
- Gating the sheet behind `DEV` mode — intentionally kept in production for
  multi-room peer identification.
- Changing route params, persistence, store, or bridge — separate issue.

## Decisions

### 1. Truncation for 8-hex roomId: `head4 + "…" + tail2`

8 hex = 4 visible chars from head + ellipsis + 2 from tail → `aabb…dd`.
Rationale: 4-byte ids are already short; `shortAddress`-style
`(head=8, tail=6)` would return the full string unchanged. The 4+…+2 pattern
keeps enough bits to disambiguate rooms verbally while clearly signalling
truncation.

For longer legacy ids (16 hex, found in `unpackLegacyCreate`) the helper
falls back to the same `shortAddress` pattern (head 4, tail 4) used elsewhere.

**Alternative considered:** always use `shortAddress(id, 4, 2)` — would
silently show the whole string when `id.length ≤ 6`. Using a conditional keeps
the ellipsis visible on short ids too.

### 2. Truncated value is what the sheet receives (prop-level gate)

Pass `shortRoomId(rawId)` at the call site before the prop boundary, not inside
the sheet component. This way the component never holds the full value and the
invariant is enforced by the call site review / source test, not by JSX
branching inside the sheet.

## Risks / Trade-offs

- [Weak secrecy on 8-hex] `aabb…dd` leaves 6 of 8 chars visible. This is
  intentional: `roomId` is a 32-bit capability, not a 256-bit key — full
  concealment at the UI layer does not raise the security bar materially.
  Defense-in-depth value comes from removing the clean copy-paste path. →
  Accepted; documented.

## Migration Plan

No migration. Pure UI + test change. Existing stored / in-memory `roomId`
values are unaffected.

## Open Questions

(none)
