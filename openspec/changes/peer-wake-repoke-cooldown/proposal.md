## Why

If Alice misses the first peer-wake banner while backgrounded, Bob’s later L1′ messages in the same relay stretch never poke again until L2 reconnects. A “worried resend” after a few minutes should re-notify her.

## What Changes

- App-side poke trigger: allow another poke when `now - lastPokedAt >= 300` seconds (same window as the poke-gateway rate limit).
- Keep existing gates (`pushWakeEnabled`, `partnerPokeHandle`) and clear-on-L2-connected behavior.
- Tests and feature doc for the updated trigger rule.

## Capabilities

### New Capabilities

- `peer-wake-notification`: Peer-wake poke timing when sending L1′ relay messages (first poke after L2 drop; re-poke after cooldown).

### Modified Capabilities

- (none)

## Impact

- `src/services/p2p/HolepunchChatTransport.ts` (`maybeSendPoke`)
- `tests/p2p/poke-trigger.test.ts`
- `docs/features/peer-wake-notification.md` §4
- No gateway, Settings, or register-API changes
