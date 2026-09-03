## 1. Relay TTL send path (TDD)

- [x] 1.1 Add failing tests: `sendChatRelay` / `broadcastSmartBody` pass 6 min and 60 min `ttlUnixSeconds`; tap / omitted TTL stays 0; create / register / revoke stay 0; broadcast failure does not retry TTL 0
- [x] 1.2 Thread optional `ttlUnixSeconds` on relay only; add optional `ttlExpiresAt` on the chat row; make 1.1 pass

## 2. Spend rings (TDD)

- [x] 2.1 Add failing tests that a TTL message build skips network and node fee, rejects dust inputs, and keeps the same mixin as a mined message
- [x] 2.2 Reuse `sendSmartMessage` (no second builder); make 2.1 pass

## 3. Erase path (TDD)

- [x] 3.1 Add failing tests: past `ttlExpiresAt` drops the bubble from room memory (in and out); expired records do not hydrate; TTL rows are not written to durable `chatRooms`
- [x] 3.2 Implement wall-clock prune plus persist / hydrate filters; make 3.1 pass. Room already expired stays on the existing wipe — no extra chat logic

## 4. Composer flyout

- [x] 4.1 Add failing tests: flyout only when chain fallback; order 60 / 6 / 0; live send has no flyout
- [x] 4.2 Implement long-press flyout and a small timer mark on TTL bubbles; make 4.1 pass

## 5. Docs

- [x] 5.1 Update `p2pchatprotocol.md` §2 / §16, `chat-relay.md`, and `encryption.md` so L1′ may be mempool-TTL without dropping mixin

## 6. Product loop

- [x] 6.1 Author and run `forge e2e run` for: chain-fallback tap is TTL 0; flyout 60 / 6 send TTL; expiry removes the bubble and it does not return on hydrate
