## 1. Runtime — Checkpoint Infrastructure

- [x] 1.1 Add `SYNC_CHECKPOINT_BLOCKS = 1000` constant to `src/services/conceal/sync/runtime.ts`
- [x] 1.2 Add `lastCheckpointHeight: number` field (init `0`) to `RuntimeCoordination` interface and `coordinationFor` factory
- [x] 1.3 Add `maybeCheckpoint(rt, coord)` async helper — no-op unless `useHeavyPath` AND `rt.state.scannedHeight - coord.lastCheckpointHeight >= SYNC_CHECKPOINT_BLOCKS`; when firing: `await persistRuntime(rt)` + update `coord.lastCheckpointHeight`
- [x] 1.4 Reset `coord.lastCheckpointHeight = 0` in the `finally` block of `runSyncChain`

## 2. Runtime — Integrate Checkpoint into Sync Loop

- [x] 2.1 In `syncOnce` single-node pipeline loop: call `await maybeCheckpoint(rt, coord)` after each `foldBatch(scanResults, endBlock)`
- [x] 2.2 In `syncOnce` multi-source `onBatch` callback: call `await maybeCheckpoint(rt, coord)` after `foldBatch(results, batchEnd - 1)`

## 3. Runtime — Flush Export

- [x] 3.1 Export `flushSyncCheckpoint(): Promise<void>` from `runtime.ts` — reads active runtime, compares `rt.state.scannedHeight` to last persisted `lastHeight`, calls `persistRuntime(rt)` when advanced; no-op when locked or nothing advanced

## 4. Lifecycle Flush

- [x] 4.1 Create `src/lib/mobile/syncLifecycleCheckpoint.ts` exporting `installSyncLifecycleCheckpoint(): () => void`; mobile-only guard (`isMobileHost()`); subscribes via `onAppAccessLifecycle`; calls `void flushSyncCheckpoint()` on `"background"` / `"screenOff"`; returns unsubscribe

## 5. Wiring

- [x] 5.1 In `src/App.tsx`, import `installSyncLifecycleCheckpoint` and call it alongside `installBackgroundRemoteSyncHook` in the same `useEffect`, returning the cleanup

## 6. Tests

- [x] 6.1 Unit test `maybeCheckpoint`: mock `persistRuntime`, verify it fires at `SYNC_CHECKPOINT_BLOCKS` boundary and not before; verify `lastCheckpointHeight` updates; verify no-op when `!useHeavyPath`
- [x] 6.2 Unit test `flushSyncCheckpoint`: no-op when runtime is locked; no-op when `scannedHeight <= lastHeight`; calls `persistRuntime` when height advanced
- [x] 6.3 Unit test `installSyncLifecycleCheckpoint`: calls `flushSyncCheckpoint` on `"background"` and `"screenOff"`; does NOT call on `"foreground"`; no-op when not mobile host
- [x] 6.4 Verify existing `sync-runtime` tests still pass (light path unchanged — no extra persist calls)
