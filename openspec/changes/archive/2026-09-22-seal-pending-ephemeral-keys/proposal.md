## Why

Invite handoff X25519 ephemeral private keys are stored as plaintext JSON under
`gnh.pendingInitiatorKeys`. That exposes in-flight session (and v2 topic) material
to XSS, DevTools, and local disk readers. SEC-2026-006 requires sealing them
without breaking async invite handoff after phone off / process death.

## What Changes

- Persist pending invite ephemeral records inside the **encrypted wallet blob**
  instead of plaintext StorageAdapter KV.
- Keep in-memory pending map for the unlocked session; restore from blob after unlock.
- Wipe pending ephemerals on handoff complete, decline/abandon, invite expiry
  retirement, leave room / L1 revoke / local destroy, and wallet wipe.
- One-time migrate any legacy `gnh.pendingInitiatorKeys` into the blob, then delete
  the plaintext KV key.
- Update security/storage docs for the new lifecycle.
- **Not BREAKING** for wire protocol; local-only persistence change. Users mid-invite
  on old plaintext KV are migrated on next unlock.

## Capabilities

### New Capabilities

- `pending-invite-ephemerals`: Durable sealed storage and wipe rules for invite
  ECDH ephemeral private keys until session handoff completes.

### Modified Capabilities

- *(none)*

## Impact

- `src/services/contacts/contactsPersistence.ts` — blob helpers; stop plaintext KV writes
- `src/state/contactsStore.ts` — upsert/remove/restore paths; leave/revoke wipe
- Wallet `RawWalletV1` GNH field + `persistRuntime`
- `src/services/storage/appDataLifecycle.ts` — wipe list / migration
- Tests under `tests/` for blob round-trip, wipe, migration
- Docs: `docs/security/encryption.md` and/or `docs/storage/*` lifecycle note
- Closes SEC-2026-006 when verified
