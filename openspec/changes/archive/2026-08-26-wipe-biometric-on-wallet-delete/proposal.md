## Why

Deleting a wallet clears native biometric enrollments but leaves
`appAccessBiometricEnabled` / `dataUnlockBiometricEnabled` true in
`gnh.settings`. After re-import, App Lock still requires biometrics with no
credential — unlock fails and the user loops with no fingerprint prompt.

## What Changes

- On **Delete wallet**, keep non-biometric prefs; force both biometric flags to
  `false` when native enrollments are cleared.
- Add a **reconcile safety net**: if a biometric flag is on but enrollment is
  missing, clear that flag and do not show App Lock (heals already-stuck
  installs).
- Tests for delete prefs reset + reconcile; short docs note.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `app-data-lifecycle`: Delete wallet must clear biometric setting flags while
  preserving other prefs in `gnh.settings`.
- `mobile-app-access`: Missing app-access enrollment MUST NOT leave the app
  lock gate enabled via a stale settings flag.

## Impact

- `src/services/storage/appDataLifecycle.ts` (+ settings store write)
- Reconcile helper (auth / mobile biometric lifecycle) + boot/gate path
- `tests/storage/app-data-lifecycle.test.ts` + reconcile unit tests
- `docs/features/app-access-and-data-unlock.md`
