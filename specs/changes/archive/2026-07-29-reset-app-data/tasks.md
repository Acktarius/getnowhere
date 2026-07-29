# Tasks

## 1. Wipe module + tests

- [x] 1.1 Add failing Vitest in `tests/storage/app-data-lifecycle.test.ts`:
      `deleteWalletData` removes wallet-tied keys and keeps `gnh.settings`;
      `resetAppData` removes wallet-tied and app-pref keys; both call
      `disconnect`. Inject fake storage + stub reload/`disconnect`.
      Verify: `npm test -- tests/storage/app-data-lifecycle.test.ts` fails
      before implementation.
- [x] 1.2 Implement `src/services/storage/appDataLifecycle.ts` with exported
      key lists, `deleteWalletData()`, `resetAppData()` (disconnect → remove →
      reload). Make `StorageAdapter.clear` required or keep optional but unused
      for MVP key-list path. Verify: same vitest passes.
- [x] 1.3 Export lifecycle helpers from a sensible barrel if one exists; keep
      comments to ≤2 lines + `@see` docs. Verify: `npm run types`.

## 2. Settings UI

- [x] 2.1 Replace the stub in `src/screens/settings/SettingsScreen.tsx` with
      **Delete wallet** and **Reset app data** buttons: `confirm()`, busy
      disable, call lifecycle functions, alert on failure.
      Verify: manual or component smoke; types clean.

## 3. Docs + integrity

- [x] 3.1 Document the two actions and key-list strategy in
      `docs/architecture/web-vs-wrapper.md` (short section). Verify: doc
      mentions both buttons and that Electron partitions stay isolated.
- [x] 3.2 Product-loop evidence: vitest suite for lifecycle is the e2e step
      (domain side effects on storage). Confirm `forge e2e run` green after
      implement. Verify: `forge e2e run`.
