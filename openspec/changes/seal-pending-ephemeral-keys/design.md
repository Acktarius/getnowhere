## Context

See proposal.md — Why. Today `contactsPersistence` writes
`PendingInitiatorRecord` (including `privateKeyHex`) to
`gnh.pendingInitiatorKeys` via `StorageAdapter`. Callers in `contactsStore`
upsert on send/accept and remove on handoff, abandon, and room destroy. An
in-memory `pendingPrivateKeys` Map already holds refs for the unlocked session.

Wallet `raw` already carries GNH extensions (`addressBook`, message stores)
and is persisted only through encrypted wallet save paths.

## Goals / Non-Goals

**Goals:**

- Move pending invite ephemeral persistence into the encrypted wallet blob.
- Preserve overnight / process-death handoff UX.
- Wipe on handoff, decline/abandon, expiry retirement, leave/revoke/destroy.
- Migrate and delete legacy plaintext KV.

**Non-Goals:**

- Changing L1 wire formats or topic suite defaults.
- Sealing post-handoff session keys (already a different store).
- Fixing SEC-2026-007–010 in this change.
- Forensic erase of OS backups.

## Decisions

### 1. Wallet blob field vs AEAD-in-KV
- **Choice:** GNH array on `RawWalletV1` (same pattern as `addressBook`).
- **Why:** One encryption boundary; unavailable when locked; rides mobile
  Keystore wallet file and web password envelope.
- **Alt:** Separate AEAD envelope in StorageAdapter — rejected (extra KDF/password lifecycle).

### 2. Field name
- **Choice:** `pendingInviteEphemerals` (or equivalent clear GNH name) on `raw`.
- **Why:** Distinct from contacts; grep-friendly; not confused with CryptoNote keys.

### 3. API surface
- **Choice:** Keep `load/upsert/remove/save` helpers in `contactsPersistence`
  (or a tiny sibling module), but implement against `getRuntime().raw` +
  `persistRuntime` instead of StorageAdapter for the secret payload.
- **Why:** Minimal caller churn in `contactsStore`.

### 4. Lock behavior
- **Choice:** Memory map cleared or left inert on lock (runtime gone); blob
  retains sealed records until unlock restore / wipe events.
- **Why:** Matches “survive phone off”; secrets not readable without unlock.

### 5. Wipe on leave/revoke
- **Choice:** Extend existing `destroyLocalRoomCompletely` / leave / revoke
  paths that already call `removePendingInitiatorKey` so they also update the
  blob (via the same remove helper).
- **Why:** User requirement; least knowledge after room end.

## Risks / Trade-offs

- **[Risk]** Wallet persist lag / Exit flush timeout → pending key not durable yet  
  → **Mitigation:** await persist on upsert in critical send/accept paths (same
  discipline as other raw mutations); document best-effort if Exit budget wins.

- **[Risk]** Mid-flight invites only in legacy KV on old builds  
  → **Mitigation:** one-shot migrate on unlock; delete KV even if empty/invalid.

- **[Risk]** XSS while wallet unlocked can still read runtime / memory  
  → **Mitigation:** accepted; SEC-2026-006 targets at-rest plaintext KV.

## Migration Plan

1. Ship blob read/write + callers.
2. On unlock/hydrate: if legacy KV present → merge into blob → `removeItem`.
3. No protocol bump; rollback = redeploy prior build (may recreate plaintext KV
   if rolled back — acceptable for short window).

## Open Questions

None — storage substrate and wipe triggers decided with the operator.
