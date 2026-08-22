## 1. Relay hint + types (TDD)

- [x] 1.1 Add failing unit tests for `peekContactHint` relay/`execute` → action `relay` + `roomId`; create/register/revoke unchanged; junk → null
- [x] 1.2 Extend `TransactionContactHint` and `peekContactHint` to satisfy tests
- [x] 1.3 Add CSS `.tx-contact-dot--relay` and WalletScreen labels for relay dots (display only first)

## 2. Navigate resolver (TDD)

- [x] 2.1 Add failing unit tests for room → contact → null resolution helper
- [x] 2.2 Implement resolver; wire relay-dot click on WalletScreen to `/chats/:roomId` or `/contacts/:id`

## 3. Pagination (TDD)

- [x] 3.1 Add failing unit tests for page-slice helper (size 25, clamp, empty, last short page)
- [x] 3.2 Implement slice helper; WalletScreen page state + Prev/Next footer when total > 25; clamp on length change; do not auto-jump off page > 1 on live updates

## 4. Mid-sync history publish

- [x] 4.1 Add throttled publish path from sync fold/batch into `useWalletStore.transactions` via existing map helper
- [x] 4.2 Keep end-of-poll / resync `refreshTransactions` as authoritative; verify no double-loading flicker on phone-friendly throttle
- [x] 4.3 Manual smoke: history grows during catch-up without pressing resync arrows

## 5. Docs

- [x] 5.1 Update `docs/features/lite-wallet.md` for live mid-sync history, page size 25, and relay dot + click behavior
