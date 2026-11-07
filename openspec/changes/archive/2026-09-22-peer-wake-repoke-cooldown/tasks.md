## 1. Tests first

- [x] 1.1 Extend `tests/p2p/poke-trigger.test.ts`: second L1′ within 300s → `sendPoke` not called again
- [x] 1.2 Same suite: advance time ≥300s (or set `lastPokedAt` old enough) → second L1′ calls `sendPoke` again

## 2. Implementation

- [x] 2.1 Add `POKE_RENOTIFY_AFTER_SEC = 300` and update `maybeSendPoke` skip condition in `HolepunchChatTransport.ts`
- [x] 2.2 Confirm L2 connected still clears `lastPokedAt` (no behavior change)

## 3. Docs

- [x] 3.1 Update poke trigger rule in `docs/features/peer-wake-notification.md` §4 for the 300s re-poke
