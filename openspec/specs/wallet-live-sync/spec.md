# wallet-live-sync Specification

## Purpose
Defines when the wallet is considered synced before a send, and how much work one sync pass does
when the wallet is already at the chain tip.

## Requirements

### Requirement: Send proceeds immediately when the wallet is at the chain tip

Before any wallet send (CCX send or smart message), the wallet SHALL compare its scanned height
with the node height. When the wallet is at most 2 blocks behind, the send SHALL proceed without
running a sync pass and without waiting for a sync pass already in progress. When the wallet is
further behind, the wallet SHALL sync first, bounded as before, then send.

#### Scenario: Synced wallet sends without a sync pass
- **WHEN** a send starts and the wallet is at most 2 blocks behind the node height
- **THEN** the send builds and broadcasts its transaction without starting or awaiting a sync pass

#### Scenario: Live sync pass already running
- **WHEN** a send starts at the tip while a background sync pass is in flight
- **THEN** the send does not wait for that pass to finish

#### Scenario: Wallet behind the tip
- **WHEN** a send starts and the wallet is more than 2 blocks behind the node height
- **THEN** the wallet syncs (within the existing time budget) before selecting inputs

### Requirement: Sync pass re-scans the last 3 blocks

Each incremental sync pass SHALL re-scan exactly the last 3 real blocks below the scanned height
(in addition to any new blocks), so a transaction a node indexed late is still found. The
re-scan SHALL never go below the wallet creation height.

#### Scenario: Late-indexed transaction 3 blocks back
- **WHEN** a transaction mined 3 blocks below the scanned height was missing from the previous pass
- **THEN** the next pass folds it into the wallet state

#### Scenario: Re-scan window size at the tip
- **WHEN** the wallet is at the tip and a sync pass runs
- **THEN** the pass requests blocks starting 3 real blocks below the scanned height, not 11

### Requirement: One mempool scan per sync pass at the tip

When the wallet is not far behind the tip, one sync pass SHALL download and scan the mempool
once. When the wallet is far behind (deep catch-up), the pass SHALL additionally scan the mempool
before catching up, so 0-conf invites still appear during a long catch-up.

#### Scenario: Pass at the tip
- **WHEN** a sync pass runs with the wallet at the tip
- **THEN** the mempool is fetched and scanned exactly once during that pass

#### Scenario: Deep catch-up
- **WHEN** a sync pass runs with the wallet far behind the tip
- **THEN** the mempool is scanned before the block catch-up and again after it
