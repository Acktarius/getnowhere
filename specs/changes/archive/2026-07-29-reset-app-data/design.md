# Design — reset-app-data

## Context

Persistence goes through `StorageAdapter` (`localStorage` on web / Electron
renderer partitions). Wallet identity is single-wallet (`"wallet"` blob).
App prefs live in `gnh.settings`. Contacts, invites, and P2P room state are
separate `gnh.*` keys and must not survive a wallet swap.

## Decisions

### Key-list wipe (not full clear + re-seed)

**Wallet-tied keys (Delete wallet + Reset):**

- `wallet`
- `gnh.onboarded`
- `gnh.contacts`
- `gnh.invites`
- `gnh.pendingInitiatorKeys`
- `gnh.contacts.ready`
- `gnh.roomCatalog`
- `gnh.roomSessions`
- `gnh.revokedRooms`

**App preference keys (Reset only):**

- `gnh.settings`
- `ccx-preferred-node` (also remove via `localStorage` if it bypasses the adapter)
- `ccx-auto-node` in `sessionStorage`
- diagnostic flags `ccx-sync-timing`, `ccx-disable-parallel-sync` (reset only)

Export the lists from the wipe module so tests and docs stay aligned.

### Hosts

| Host | Behavior |
|---|---|
| Browser | Key-list via active `StorageAdapter` + side channels |
| Electron | Same; partition-scoped `localStorage` already isolates Alice/Bob |
| Future native | Same API; adapter `removeItem` hits secure store |

No `gnhDesktop.resetAppData` IPC in this change.

### Flow

```
confirm → disconnect() → remove keys → reload → Welcome / Import
```

On wipe error after disconnect: surface a short alert; do not claim success.
Reload is the primary way to reset Zustand in-memory state.

### Alternatives rejected

- Full `clear()` + re-write settings for delete wallet — fragile.
- Electron `session.clearStorageData` for delete wallet — kills prefs.

## Risks

- New persistence keys added later may be missed until the list is updated —
  mitigate by documenting the list and exporting constants.
- `ccx-*` keys currently touch `localStorage` directly; wipe must hit them
  explicitly until they move behind `StorageAdapter`.
