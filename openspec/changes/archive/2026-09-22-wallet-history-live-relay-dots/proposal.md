## Why

Wallet history feels stale during catch-up (updates mainly after manual resync) and does not surface L1′ relay smartmessages as clearly as invite create/register. Users need progressive history and an explicit path from a relay tx into the related room (or contact).

## What Changes

- Publish mapped transaction history into Zustand as sync folds batches (throttled), not only at poll end / resync arrows.
- Paginate wallet history UI at 25 txs per page with prev/next when total exceeds 25.
- Color-dot L1′ `execute`/`relay` contact smartmessages; clicking a relay dot navigates to the room if present, otherwise the related contact.
- Document behavior in `docs/features/lite-wallet.md`.

## Capabilities

### New Capabilities

- `wallet-transaction-history`: Live Zustand history during sync, client pagination (25), and contact smartmessage dots including clickable L1′ relay navigation.

### Modified Capabilities

- (none)

## Impact

- `src/services/conceal/sync/runtime.ts` (or adjacent publish hook) — mid-sync transaction publish
- `src/state/walletStore.ts` — consume publishes / refresh path
- `src/screens/wallet/WalletScreen.tsx` — pagination + relay click
- `src/services/protocol/SmartMessageProtocolAdapter.ts` — `peekContactHint` relay + roomId
- `src/types/models.ts` — `TransactionContactHint` extension
- `src/styles/global.css` — `.tx-contact-dot--relay`
- `docs/features/lite-wallet.md`
- Unit tests for hint peek, page slice, navigate resolver
