# Tasks

## 1. Honest outbound status

- [x] 1.1 Update docs first: `docs/features/chat-relay.md` gains a message status section (queued / sending / sent / failed; `delivered` inbound-only until a peer ACK) and `docs/security/p2pchatprotocol.md` §14 states live envelopes may be retransmitted after reconnect and receivers treat `messageId` as idempotent; verify both sections match the spec
- [x] 1.2 Add `sent` to `ChatMessage.status` in `src/types/models.ts` with a short JSDoc (`@see docs/features/chat-relay.md`); verify `npm run types` passes
- [x] 1.3 Set outbound `sent` in `HolepunchChatTransport` (live send, relay success, outbound relay hydrate), `chatStore` edit/delete rows, and `MockChatTransport`; make a live send with no topic throw; verify with `tests/p2p/outbound-status-sent.test.ts` asserting `sent` for each path, inbound hydrate still `delivered`, and the missing-topic throw
- [x] 1.4 Update `MessageBubble` icons (sending → Clock, sent/legacy delivered → single Check, no CheckCheck); verify with `tests/components/MessageBubble.status.test.tsx` covering queued, sending, sent, legacy delivered, failed
- [x] 1.5 Update the existing tests that assert outbound `delivered` (`chat-message-merge`, `room-chain-restore`, `chat-rooms-blob`, `bootstrap-connect`, `chat-transcript-flush`, `chat-rooms-wallet`, `l1-prime-ttl-erase`, `ChatRoomTtlFlyout`) where the row is outbound; verify those files pass

## 2. Serialized live send and replay after reconnect

- [x] 2.1 Extract `sealAndSendLiveFrame` behind a per-room promise chain and route `sendContent` through it; verify `tests/p2p/live-send-serialized.test.ts`: two overlapping sends get distinct nonces and the stored send counter advances by two
- [x] 2.2 Add the in-memory replay list (`rememberLiveSend`, max 3, 5 min from first send, dedupe by `messageId`) and `resendRecentLiveSends` (oldest first, 300 ms gap, stop when not connected, one batch per room, no local notify); call it after proof success in `attemptConnect`; verify `tests/p2p/live-resend-after-reconnect.test.ts`: last three of four replayed in order, expired entry skipped, no replay on proof timeout, local edit preserved, no parallel batch
- [x] 2.3 Receiver skips a repeated inbound `messageId` in `handleIncomingFrame` without notifying subscribers; verify a test named "repeated message id …" in `tests/p2p/live-resend-after-reconnect.test.ts` delivering the same sealed text twice leaves one row and one subscriber call
- [x] 2.4 Clear the replay list on `leaveRoom`, revoked `ensureRoom`, `listRooms` prune, `__resetHolepunchTransport`, and via exported `clearRecentLiveSends()` from `walletStore.lock()`; verify a test that locks, reconnects, and asserts nothing is replayed
- [x] 2.5 Product-loop test `tests/p2p/live-resend-loop.test.ts`: connected room sends a text while the fake peer drops it, peer count goes to 0, peer returns and answers the proof, and the frame captured after reconnect opens with the peer's receive key to the original text; verify `forge e2e run` is green

## 3. Validation

- [x] 3.1 Run `npm run lint`, `npm run format:fix`, `npm run check`, `npm run types`, `npm test`; verify all pass with no unrelated diffs
- [x] 3.2 Two-device manual check with a release APK (`npm run mobile:android:release:test`, then `adb install -r`) and desktop-electron: sent bubbles show one check; toggle the phone's network right after sending, reconnect, confirm the message appears on the other side
