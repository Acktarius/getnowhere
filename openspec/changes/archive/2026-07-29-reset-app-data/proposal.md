# Reset app data / delete wallet

## Why

Settings shows a **Reset app data** button with no handler. Operators who need
to import a different Conceal wallet today must manually clear site data or
delete Electron `userData` trees. That is easy to get wrong (too little → stuck
onboarding; too much → lose theme prefs they wanted to keep).

The product needs two intentional wipes: drop only wallet-tied state so a new
wallet can be imported while keeping preferences, or wipe everything local and
start clean.

## What Changes

- Wire Settings with two danger actions: **Delete wallet** and **Reset app data**.
- Add `deleteWalletData()` and `resetAppData()` that:
  - call wallet `disconnect()` first (clear in-memory runtimes/keys),
  - remove documented key sets through `StorageAdapter`,
  - clear known side-channel keys (`sessionStorage` node auto-pick),
  - reload so UI returns to Welcome / Import.
- **Delete wallet** removes wallet-tied keys only; **keeps** `gnh.settings`.
- **Reset app data** removes wallet-tied keys **and** app preference keys.
- Both use `window.confirm` before running.
- Document the key-list strategy in architecture docs.
- Unit tests prove key preservation vs full wipe (must fail on a no-op).

## Capabilities

- `app-data-lifecycle`: delete-wallet and reset-app-data wipe contracts — delta at
  `specs/app-data-lifecycle/spec.md`.

## Impact

Affected: `src/services/storage/` (new wipe module), `StorageAdapter` (ensure
`clear`/`removeItem` usable), `SettingsScreen.tsx`, architecture docs, Vitest
under `tests/`.

No Electron IPC, no crypto/protocol changes, no mobile native bridge yet.
Passcode remains the in-memory mock (no persisted passcode key to wipe today).
