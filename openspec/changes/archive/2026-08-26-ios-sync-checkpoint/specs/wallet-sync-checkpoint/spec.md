## Purpose

Ensures that wallet sync progress (`scannedHeight`) is durably persisted at regular block intervals during deep catch-up and immediately when the app backgrounds, so that a process kill or iOS WebView freeze does not reset the wallet to its creation height on the next open.

## ADDED Requirements

### Requirement: Mid-sync checkpoint persist during deep catch-up

During a deep catch-up sync (when the wallet is more than a configurable threshold behind the network tip), the sync engine SHALL persist `scannedHeight` to durable storage at intervals no greater than `SYNC_CHECKPOINT_BLOCKS` (1000) blocks, without waiting for the full sync pass to complete.

#### Scenario: Checkpoint fires at block interval boundary
- **WHEN** the wallet is in deep catch-up mode and has scanned at least `SYNC_CHECKPOINT_BLOCKS` blocks since the last checkpoint
- **THEN** the runtime SHALL persist the current `scannedHeight` and all associated wallet state to storage before continuing

#### Scenario: No checkpoint on light (incremental) path
- **WHEN** the wallet is near the network tip and not in deep catch-up mode
- **THEN** the sync engine SHALL NOT issue additional mid-sync persist calls (behavior is unchanged from pre-checkpoint)

#### Scenario: Resume after mid-sync process kill
- **WHEN** the app process is killed after at least one checkpoint has been written during deep catch-up
- **THEN** on the next unlock, `scannedHeight` SHALL resume from the last checkpointed height, not from `creationHeight`

### Requirement: Background lifecycle flush

The wallet sync engine SHALL provide a mechanism to flush the current in-memory `scannedHeight` to durable storage when the app transitions to background or screen-off state.

#### Scenario: Flush on background lifecycle event
- **WHEN** the app receives a `"background"` or `"screenOff"` lifecycle event while a sync is in progress or since the last persist
- **THEN** the sync engine SHALL attempt to persist the current `scannedHeight` before the WebView is frozen

#### Scenario: Flush is no-op when nothing advanced
- **WHEN** the flush is triggered but `scannedHeight` has not advanced since the last durable write
- **THEN** the flush SHALL complete without issuing a storage write

#### Scenario: Flush does not fire on foreground
- **WHEN** the app receives a `"foreground"` lifecycle event
- **THEN** the background flush mechanism SHALL NOT trigger an additional persist

### Requirement: Android compatibility

The checkpoint and lifecycle flush mechanisms SHALL NOT degrade Android sync behaviour, performance, or reliability.

#### Scenario: Android deep catch-up with checkpoints
- **WHEN** deep catch-up runs on Android with checkpoint persist enabled
- **THEN** sync SHALL complete normally, with the only observable difference being additional intermediate persist calls at checkpoint boundaries (idempotent with respect to final state)

#### Scenario: Android incremental sync unchanged
- **WHEN** an already-synced Android wallet polls for new blocks (light path)
- **THEN** no additional persist calls SHALL occur compared to pre-checkpoint behaviour
