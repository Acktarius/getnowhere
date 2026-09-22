# Tasks

## 1. Stop auto-supersede and fix room UI
- [x] 1.1 Add/adjust tests covering: create with existing open same-topic room
  does not abandon the old room; ChatRoom does not treat
  `contact.roomId !== roomId` as superseded. Prefer
  `tests/` protocol or contacts-store focused tests; verify with
  `npx vitest run` on the touched files (expect fail before fix).
- [x] 1.2 Update `src/state/contactsStore.ts` create path to stop
  auto-`abandonPendingInvite` for prior same-topic rooms; keep Leave/revoke
  and true abandon APIs. Remove superseded banner from
  `src/screens/chats/ChatRoomScreen.tsx`. Make 1.1 tests pass.

## 2. Same-topic create confirm + copy
- [x] 2.1 In `src/screens/contacts/ContactDetailScreen.tsx`, before create /
  resend when an open room exists for the selected `roomTopic`, show confirm:
  “You already have an open room with the same topic. Are you sure you want
  to create a new one?” Cancel aborts; Confirm creates. Rewrite Resend
  accepted-relay confirm so it no longer says the old room ends or the peer
  is superseded. Add/adjust UI or store helper tests as needed.

## 3. Docs and product-loop evidence
- [x] 3.1 Update `docs/security/p2pchatprotocol.md` (and contact copy refs if
  any) to allow multiple rooms per contact; same-topic create requires
  confirm; Leave/revoke ends rooms; remove “always supersedes” / superseded
  UI wording.
- [x] 3.2 Run `forge e2e run` and require green current results for the
  focused vitest product loop.
