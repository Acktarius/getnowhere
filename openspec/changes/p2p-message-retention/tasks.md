# Tasks

## 1. Failing tests

- [x] 1.1 Add tests that fail today: L2 flush skipped when retention is off; L2 written on hide and after coalesced live send when on; unlock with retention off restores L1′ sent but not live rows; expire/revoke drops matching L1′ `e` rows and tombstones `chatRooms`. Prefer `tests/p2p/` and `tests/storage/`.
- [x] 1.2 Add unlock-merge tests: live + L1′ sent/received for one room, no duplicate ids; revoked tombstone still blocks re-seed.

## 2. L2 persist and toggle gate

- [x] 2.1 Export a single flush helper used by Exit, hide, and debounce. Gate writes with `privacy.localMessageRetention`. Keep the settings key; do not persist L2 when off.
- [x] 2.2 Wire ~1s coalesced flush after L2 send/receive and immediate flush on hide (`installSyncLifecycleCheckpoint` plus web `visibilitychange`/`pagehide`). No-op if locked. Make 1.1 hide/debounce cases pass.
- [x] 2.3 Keep Exit calling the same helper before soft-leave. Hydrate MUST skip live rows from `chatRooms` when the toggle is off. Make remaining 1.1 L2 cases pass.

## 3. L1′ hydrate and housekeeping

- [x] 3.1 On unlock, merge parsed L1′ sent/received (`{contact,e,roomId,…}`) into the room thread. Dedupe by message id. Make 1.2 pass.
- [x] 3.2 On `leaveRoom` / expire / revoke, after the `chatRooms` tombstone, drop sent/received rows whose parsed body is relay for that room id. Leave create/register/revoke rows. Make 1.1 destroy cases pass.

## 4. Settings, docs, product loop

- [x] 4.1 Rename Settings label/description to **P2P message retention** (L2-only scope; L1′ sent still show). Default stays ON.
- [x] 4.2 Update `docs/security/encryption.md`, `docs/architecture/web-vs-wrapper.md`, and `docs/features/chat-relay.md` for hide+Exit persist, L1′ hydrate, and destroy-path prune.
- [x] 4.3 Product-loop acceptance: `forge e2e run` green for this change (vitest steps covering persist, hydrate merge, and housekeeping).
