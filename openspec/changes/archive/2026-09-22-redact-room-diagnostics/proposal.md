## Why

The room diagnostics sheet exposes `roomId` (copyable, full value) and a
`shortTopicRef` display in both `LoadingDiagnosticsSheet` and the full
`ChatRoomScreen` diagnostics sheet. Protocol treats `roomId` and `topicRef` as
capability secrets (docs/security/capabilities-and-derivation.md §IDs are
capabilities). Screenshots, DOM readers, and shared screens can capture them
from the production UI today.

## What Changes

- Add `shortRoomId(roomId)` helper in `src/utils/format.ts` — truncates the
  8-hex (4-byte) room id to a 4+…+2 label (e.g. `aabb…cd`) that lets peers
  verbally identify a shared room without exposing the full capability.
- Both diagnostics surfaces (`LoadingDiagnosticsSheet` and the full
  `ChatRoomScreen` sheet) pass **only the truncated label** as the `CopyButton`
  value and as the display text — the full id never enters the sheet's JSX or
  clipboard.
- Topic display remains unchanged (already non-copyable, `shortTopicRef` only).
- Update `tests/components/sensitive-identifier-copy.test.ts` to assert the
  truncated helper is used, not the raw id.
- Add a focused unit test file for `shortRoomId` and `shortTopicRef` in
  `tests/utils/format-short-ids.test.ts`.

## Capabilities

### New Capabilities

- `room-diagnostics-display`: UI contract for what the room diagnostics sheet
  is permitted to display and copy — truncated capability labels only; no full
  `roomId` or `topicRef` in sheet props, JSX, or clipboard.

### Modified Capabilities

(none — no existing spec covers this surface)

## Impact

- `src/utils/format.ts`: add `shortRoomId`.
- `src/screens/chats/ChatRoomScreen.tsx`: use `shortRoomId` in both sheet
  call sites; remove raw `displayRoom.id` / `roomId` from sheet JSX and
  `CopyButton value`.
- `tests/components/sensitive-identifier-copy.test.ts`: tighten assertions to
  require truncated helper usage.
- `tests/utils/format-short-ids.test.ts`: new unit tests for `shortRoomId` /
  `shortTopicRef`.
- No protocol, bridge, or persistence changes. No breaking API surface.
