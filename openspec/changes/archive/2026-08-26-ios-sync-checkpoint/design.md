## Context

`syncOnce()` in `src/services/conceal/sync/runtime.ts` runs a full scan loop,
advancing `rt.state.scannedHeight` in-memory after every batch, then calls
`persistRuntime(rt)` exactly once at the end. On iOS, WKWebView JS execution
is suspended immediately when the OS backgrounds the app; the single end-of-sync
persist never runs. Android chains WorkManager one-shots while backgrounded
(`setNativeAppInBackground`), giving sync more wall-clock time to finish.

The `foldBatch` / `syncOnce` pipeline is the only place where `scannedHeight`
advances during a normal sync. `persistNow` serialises `rt.state` (including
`scannedHeight`) into the encrypted blob. `RuntimeCoordination` tracks the
per-wallet in-flight scan and a serialised persist chain.

## Goals / Non-Goals

**Goals:**
- Durable `scannedHeight` checkpoints every ≤1000 blocks on deep catch-up.
- Immediate flush to storage when the app signals background/screen-off.
- Zero behaviour change on the light (incremental tip-poll) path.
- Zero Android regression.

**Non-Goals:**
- iOS native `beginBackgroundTask` extension (left as future hardening).
- Changing the Android WorkManager chain.
- Changing persist frequency on the light sync path.

## Decisions

### Decision: Checkpoint only on `useHeavyPath`

The heavy path (`useHeavyPath = true`) engages only when the wallet is
`FAR_BEHIND_THRESHOLD` (2000) blocks behind. Incremental tip-polls (the
overwhelmingly common case for an already-synced wallet) stay on the existing
single-persist path.

**Why:** Extra encrypt+write round-trips add latency. On the light path (≤2000
blocks, often ≤10) the cost is unjustified and the window for a mid-sync kill is
negligible. On the heavy path (potentially tens of thousands of blocks, taking
minutes), intermediate checkpoints are essential for iOS survival.

**Alternatives considered:**
- Checkpoint on every path: unnecessary overhead on incremental polls.
- OS-level BGTask: adds native complexity; still does not prevent a kill before
  the task fires.

### Decision: `lastCheckpointHeight` stored in `RuntimeCoordination`

The threshold check (`scannedHeight - lastCheckpointHeight ≥ SYNC_CHECKPOINT_BLOCKS`)
lives in `RuntimeCoordination`, which is already per-wallet and cleared between
sync chains. This means the checkpoint counter resets at the start of each call to
`runSyncChain` — natural, since a fresh `syncOnce` already persists at the end.

**Alternatives considered:**
- Module-level variable: breaks per-wallet isolation (multi-wallet case).
- `SdkRuntime` field: couples persistence coordination to the runtime struct;
  `RuntimeCoordination` is the established home for per-runtime sync/persist state.

### Decision: Lifecycle flush via `onAppAccessLifecycle`

`AppAccessController.onAppAccessLifecycle` already fires on `"background"` /
`"screenOff"` from the native lifecycle bridge. Subscribing there avoids a second
bridge listener and keeps the flush in the JS layer — no native changes.

**Alternatives considered:**
- Direct `AppState.addEventListener` in native-wrapper: would only reach native,
  not the WebView JS where `persistRuntime` runs.
- A dedicated MobileBridge channel: overkill for a best-effort flush.

### Decision: `flushSyncCheckpoint` is a standalone export

Exporting it separately allows the lifecycle subscriber to call it without importing
`persistRuntime` directly (which would widen the public surface of `runtime.ts`),
and makes it independently testable.

## Risks / Trade-offs

- **Extra persist latency on deep catch-up** → Mitigated by 1000-block threshold:
  for a 100 000-block catch-up this means ~100 extra writes, each ~1–5 ms. Total
  overhead is negligible compared to the hours a full re-sync takes.
- **Race: lifecycle fires mid-persist** → `persistRuntime` already serialises
  writes via `persistChain`; the lifecycle flush enqueues behind any running write.
- **iOS WebView frozen before flush completes** → The lifecycle flush is best-effort.
  The per-batch checkpoint is the primary defence; the flush covers the last partial
  batch. Both together minimise but cannot eliminate the data-loss window.

## Migration Plan

No migration required. Existing persisted blobs are forward-compatible: on unlock
`buildState` reads `sdkWalletState` as before. The only change is that future blobs
are written more frequently during deep catch-up.
