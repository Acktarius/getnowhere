## 1. Model and protocol

- [x] 1.1 Add optional `replyToMessageId` and `replyPreview` to `ChatMessage` and `ChatContentEnvelopeV1`; verify TypeScript compiles for those types
- [x] 1.2 Document the fields as live-only in `docs/security/p2pchatprotocol.md` §14; verify the doc lists both fields and states L1′ has no reply metadata
- [x] 1.3 Add a small truncate helper (default ~100 code points + ellipsis) with unit tests covering short, long, and empty strings

## 2. Transport and store

- [ ] 2.1 Map `replyToMessageId` / `replyPreview` on live send and receive in `HolepunchChatTransport`; verify a round-trip unit/integration test asserts both fields on `kind: "text"` live messages
- [ ] 2.2 Extend `chatStore.sendMessage` (and transport API) to accept optional reply args; verify relay sends never attach reply fields
- [ ] 2.3 Persist reply fields through live transcript merge/restore paths used by the room; verify a restored message still shows `replyPreview`

## 3. UI

- [ ] 3.1 Add Reply action (arrow icon) to `MessageBubble` immediately beside the Edit pencil slot (Copy → Reply → Edit → Delete → Close), gated by online + inbound live + not deleted; verify Reply is absent when offline, outbound, relay, or deleted
- [ ] 3.2 Wire `ChatRoomScreen` pending-reply state: grey truncated preview above composer, focus input, clear on outside-input click/tap; verify cancel leaves the next send without reply fields
- [ ] 3.3 Render grey truncated quote above bubble body when `replyPreview` is set (in and out); verify snapshot text does not change if parent is later edited/deleted in tests or a focused manual check documented in the task evidence

## 4. Verification

- [ ] 4.1 Run targeted tests for truncate helper + transport/store reply mapping and fix failures until green
- [ ] 4.2 Manual smoke on two live peers: reply → preview → send → quote on both sides; cancel-by-outside-click; no Reply when not connected — record pass/fail notes
