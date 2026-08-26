## Why

On iOS, when the phone sleeps or the app backgrounds during a long wallet sync, WKWebView JS timers freeze immediately. Because the sync engine persists `scannedHeight` only once at the very end of each `syncOnce` pass, any mid-sync progress is lost and the wallet restarts from `creationHeight` on the next open. Android is less affected because it chains 30-second WorkManager one-shots that keep the sync running; no equivalent exists for iOS.

## What Changes

- Add a `SYNC_CHECKPOINT_BLOCKS` constant (1000) and a `lastCheckpointHeight` field to `RuntimeCoordination` in `runtime.ts`.
- Add a `maybeCheckpoint(rt, coord)` helper that calls `persistRuntime(rt)` every ~1000 blocks during deep catch-up (`useHeavyPath` path only — light incremental polls are unchanged).
- Export `flushSyncCheckpoint()` for on-demand flush (idempotent: no-op if nothing advanced).
- Add `installSyncLifecycleCheckpoint()` in a new `src/lib/mobile/syncLifecycleCheckpoint.ts` — subscribes to the app lifecycle and calls `flushSyncCheckpoint()` on `"background"` / `"screenOff"` events (mobile-only, Android-safe).
- Wire `installSyncLifecycleCheckpoint` in `src/App.tsx` alongside the existing background sync hook.

## Capabilities

### New Capabilities

- `wallet-sync-checkpoint`: Mid-sync durable progress persistence — the wallet sync engine persists `scannedHeight` at configurable block-count intervals during deep catch-up, and flushes on app-background lifecycle events.

### Modified Capabilities

*(none — no existing spec-level requirements change)*

## Impact

- **`src/services/conceal/sync/runtime.ts`**: New constant, coordination field, helper, and export; `foldBatch` call sites gain one `await maybeCheckpoint()` each.
- **`src/lib/mobile/syncLifecycleCheckpoint.ts`**: New file.
- **`src/App.tsx`**: One extra hook wired in `useEffect`.
- **Android**: Same code paths — extra persist calls are idempotent and only fire on the deep-catch-up path; WorkManager chain is unchanged.
- **No native-module changes.**
