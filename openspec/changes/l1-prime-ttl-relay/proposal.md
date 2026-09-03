# L1′ TTL relay (cheap / auto-destroy)

## Why

Chain-fallback `chat.relay` always mines today, so every wake or SMS-class
line spends CCX and leaves text in a Conceal MESSAGE extra. Users need a
cheaper opt-in that still wakes a peer, and a real auto-destroy when they do
not want that text mined.

## What Changes

- When the composer is already on chain fallback, tap send stays classic
  `chat.relay` with TTL 0 (mined, paid, durable).
- Long-press opens a flyout: 60 min (top), 6 min (middle), TTL 0 (bottom).
  The 6 / 60 options send the same `chat.relay` body with Conceal mempool TTL.
- TTL relays are mempool-only, skip network and node fees, then vanish from
  the chain and from **both** rooms. They are never written into durable
  `chatRooms`.
- Create / register / revoke stay TTL 0. Same mixin / decoys as a normal
  message; no dust inputs; no silent fallback to a mined send.
- Docs: L1′ may be mempool-TTL, not always mined.

## Capabilities

### New Capabilities

- `l1-prime-ttl-relay`: chain-fallback flyout, TTL 6 / 60 send, erase from
  both rooms, no `chatRooms` persist, full rings on TTL spends

### Modified Capabilities

- `chat-encryption-privacy`: L1′ may be mempool-TTL (no mine, no fee) while
  still using Conceal mixin / MESSAGE encryption; not always a paid mined tx

## Impact

- Composer UI (`ChatRoomScreen`) — long-press flyout only when `viaChain`
- `sendRelayText` / `sendChatRelay` / `broadcastSmartBody` — optional
  `ttlUnixSeconds` on relay only
- Existing `sendSmartMessage` TTL path (do not fork spend)
- `ChatMessage.ttlExpiresAt`, room prune timer, hydrate / `saveChatRoomsToWallet`
- Existing `dropExpiredTtl` remains the wallet-record wipe
- Docs: `p2pchatprotocol.md` §2 / §16, `chat-relay.md`, `encryption.md`
- Tests around broadcast, spend rings, prune, persist, composer order
