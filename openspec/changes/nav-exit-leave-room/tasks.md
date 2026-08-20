# Tasks

## 1. ConfirmModal + Settings confirms
- [x] 1.1 Extract `ConfirmModal` to `src/components/ConfirmModal.tsx` with
  generic `busyLabel` (and optional busy status); remove leave-room hardcoding
  from `Sheet.tsx`. Update imports in ChatRoom, ContactDetail, BackupSettings.
  Verify existing confirm flows still open/close (manual or component test).
- [x] 1.2 Replace Settings `window.confirm` / `window.alert` for delete-wallet
  and reset-app with `ConfirmModal`. Cancel is no-op. Verify with
  `npx vitest run` on any new/updated lifecycle tests (or document manual
  check if UI-only).

## 2. leaveRoom rename + nav Exit
- [x] 2.1 Rename `ChatTransport.disconnect` → `leaveRoom` in
  `src/types/services.ts`, `HolepunchChatTransport.ts`, `MockChatTransport.ts`,
  and `contactsStore` call sites. Grep clean for chat `disconnect(roomId)`.
  Run focused transport/contacts tests.
- [x] 2.2 Reorder `BottomNav`: Chats → Contacts → Wallet → Settings → Exit.
  Exit opens Confirm disconnect; on confirm run exit sequence (persist +
  soft-leave + wallet disconnect + `/welcome`). Add/adjust unit tests for the
  exit helper where practical.

## 3. Wallet-blob transcripts + revoke tombstone
- [x] 3.1 Add tests for: flush messages into wallet `chatRooms`; hydrate on
  unlock; `leaveRoom`/revoke writes `{ roomId, revoked: true }` only and blocks
  re-seed. Prefer `tests/` under contacts/p2p/persistence. Expect fail first.
- [x] 3.2 Implement transcript persist/hydrate in transport + wallet raw field;
  wire Exit flush gated by `privacy.localMessageRetention` (on = flush messages,
  off = skip message write); wire revoke/`leaveRoom` tombstone and keep
  `gnh.revokedRooms` consistent. Make 3.1 pass. Align Settings copy if needed.
- [x] 3.3 Update docs (`encryption.md` and/or `p2pchatprotocol.md`,
  `web-vs-wrapper.md` if wipe keys list changes) for blob transcripts and
  Exit vs leaveRoom. Run `forge e2e run` green for this change.
