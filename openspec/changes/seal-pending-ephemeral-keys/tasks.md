## 1. Blob persistence helpers (TDD)

- [x] 1.1 Add failing tests for read/upsert/remove of `pendingInviteEphemerals` on wallet `raw` (no `gnh.pendingInitiatorKeys` write)
- [x] 1.2 Implement raw helpers + wire `load/upsert/remove` to `getRuntime`/`persistRuntime`
- [x] 1.3 Add failing test for legacy KV migrate-then-delete; implement migration on unlock/hydrate

## 2. Call-site wipe coverage

- [x] 2.1 Point `contactsStore` send/accept upsert + restore at blob-backed helpers
- [x] 2.2 Ensure handoff-complete, decline, abandon, expiry retirement, leave/revoke/destroy all remove from blob (tests for handoff + leave/revoke)
- [x] 2.3 Confirm `wipeWalletScopedLocalData` / app-data wipe no longer relies on plaintext pending-key KV (or clears both during transition)

## 3. Docs and ledger

- [x] 3.1 Document sealed pending-ephemeral lifecycle in `docs/security/encryption.md` (or storage doc) with wipe triggers
- [x] 3.2 Mark `SEC-2026-006` resolved in `docs/guidelines/security-module-review.md` after tests pass (evidence only; no exploit dump beyond existing)

## 4. Verify

- [x] 4.1 Run targeted vitest for pending-ephemeral helpers and wipe paths
- [x] 4.2 Grep confirms no production writer of plaintext `gnh.pendingInitiatorKeys`
