## 1. Utility helper

- [ ] 1.1 Add `shortRoomId(id: string): string` to `src/utils/format.ts` — 8-hex
  input → `head4 + "…" + tail2`; longer input → `shortAddress(id, 4, 4)`;
  empty/short → return as-is. Verify: unit tests pass (`tests/utils/format-short-ids.test.ts`).

## 2. Unit tests for helpers

- [ ] 2.1 Create `tests/utils/format-short-ids.test.ts` covering `shortRoomId`
  (8-hex nominal, 16-hex legacy, empty, already-short) and `shortTopicRef`
  (64-hex nominal, short passthrough). Verify: `npx vitest run tests/utils/format-short-ids.test.ts` is green.

## 3. Screen — truncate at call sites

- [ ] 3.1 In `ChatRoomScreen` — `LoadingDiagnosticsSheet` call site: replace
  `roomId` prop with `shortRoomId(roomId)`; keep `CopyButton value` bound to
  this truncated string. Verify: no raw `roomId` string reaches the sheet prop.

- [ ] 3.2 In `ChatRoomScreen` — full diagnostics sheet JSX: replace
  `<CopyButton value={displayRoom.id} />` with
  `<CopyButton value={shortRoomId(displayRoom.id)} />`; update the adjacent
  `NonSelectableText` to display `shortRoomId(displayRoom.id)`. Verify: no
  `CopyButton value={displayRoom.id}` remains in the file.

## 4. Update source-guard test

- [ ] 4.1 Update `tests/components/sensitive-identifier-copy.test.ts`:
  remove the assertions that required `CopyButton value=\{displayRoom\.id\}` and
  `CopyButton value=\{roomId\}`, add assertions that `shortRoomId` is imported
  and that `CopyButton value` is bound to its output for both sheet sites.
  Verify: `npx vitest run tests/components/sensitive-identifier-copy.test.ts` is green.

## 5. Verify full suite

- [ ] 5.1 Run `npx vitest run tests/utils/format-short-ids.test.ts tests/components/sensitive-identifier-copy.test.ts`
  — all tests green. No TypeScript errors in touched files
  (`npx tsc --noEmit --project tsconfig.json`).
