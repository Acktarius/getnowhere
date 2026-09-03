## Context

See proposal.md for why. Today `broadcastSmartBody` hardcodes
`ttlUnixSeconds: 0` for every smart message, including L1′. `sendSmartMessage`
already builds Conceal TTL txs (fee skip, `ttlExpiresAt`, full mixin). Wallet
`dropExpiredTtl` already drops unconfirmed records past TTL. Chat also keeps
copies in memory and, when retention is on, in `raw.chatRooms` — those copies
would survive a wallet-only wipe. conceal-next-wallet is the reference for
mempool-only messages (`ttlRefetchMs`, never mined, fee folded to change).

## Goals / Non-Goals

**Goals:**
- Thread TTL through relay only; reuse existing spend
- Erase from wallet records, room memory, and durable `chatRooms`
- Flyout only on chain fallback; order 60 / 6 / 0

**Non-Goals:**
- New wire action or channel type
- SDK changes
- View-only wallets
- Free-form TTL, countdown clock, expired tombstone
- Changing poke or L2 send

## Decisions

1. **Same `chat.relay` body** — optional `ttlExpiresAt` on the chat row;
   `channel` stays `relay`. Alternative: new `relay_ephemeral` channel —
   rejected; extra types for the same user-visible path.

2. **Reuse `sendSmartMessage`** — `sendChatRelay` passes `ttlUnixSeconds`;
   create / register / revoke keep hardcoded 0. Alternative: a second builder
   that skips decoys — rejected (anonymity).

3. **Never persist TTL rows to `chatRooms`** — `saveChatRoomsToWallet`
   strips `ttlExpiresAt` rows; hydrate / L1′ merge skip expired records.
   Alternative: persist then prune on unlock — rejected; a killed process
   would restore the bubble until the next prune.

4. **Wall-clock room prune** — soonest-expiry timer (next-wallet
   `ttlRefetchMs`). Locked wallet prunes on next unlock / sync.

5. **No silent fallback to TTL 0** — broadcast or build failure is a failed
   send. Alternative: retry mined — rejected; that spends CCX the user opted
   out of.

6. **Room already dead** — existing expire / revoke / leave wipe is enough.
   Leftover wallet pending until tx TTL needs no chat UI.

## Risks / Trade-offs

- [Friend opens after TTL] → poke may still wake them; text is gone by
  design. Durable tap remains available.
- [Funds locked until TTL] → same as next-wallet; show the usual unspent
  error if the wallet cannot build the tx.
- [Old daemon rejects TTL] → fail closed; do not mine instead.
- [p2p-message-retention “L1′ always hydrates”] → TTL rows are the
  exception: they hydrate only while unexpired and never via `chatRooms`.

## Migration Plan

No blob migration. Existing mined relays are TTL 0 and unchanged. New field
`ttlExpiresAt` is optional; older rows treat missing as durable.

## Open Questions

None. Presets, erase rules, and flyout order are fixed in the specs.
