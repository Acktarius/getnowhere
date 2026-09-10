## Context

See proposal.md for motivation. Today Exit flushes `messagesByRoom` into
`raw.chatRooms` only when `privacy.localMessageRetention` is on. L1′ outbound
already writes `raw.sentMessages` at broadcast; inbound lands in
`receivedMessages`. Hydrate reads `chatRooms` only. `leaveRoom` tombstones
`chatRooms` but does not prune L1′ `e` rows. Hide already checkpoints wallet
sync (`installSyncLifecycleCheckpoint`); it does not flush L2 transcripts.

L1′ wire is `{contact,e,<roomId>,<sentAtUnix>,<text>}`. Housekeeping parses
`record.body`; no `topicRef` on L1′.

## Goals / Non-Goals

**Goals:**

- Same encrypted wallet blob; layer-specific fields.
- L2 flush on debounce, hide, and Exit when the toggle is ON.
- Unlock merge of L2 + parsed L1′; OFF skips L2 hydrate.
- Destroy-path prune of matching L1′ `e` rows.

**Non-Goals:**

- Second ciphertext store.
- Immediate wipe of `chatRooms` L2 when the user turns the toggle OFF.
- L1′ wire or fee changes.
- Peer history catch-up / Hypercore.

## Decisions

| Topic | Choice | Alternatives rejected |
|---|---|---|
| Toggle key | Keep `privacy.localMessageRetention`; change label/copy only | Rename settings key (migration noise) |
| L2 store | `raw.chatRooms` | Separate secure store |
| L1′ store | Existing `sentMessages` / `receivedMessages` | Duplicate L1′ only inside `chatRooms` |
| Flush bag | Same whole-map flush as Exit (`messagesByRoom` → active rooms) | Per-room writes only |
| Debounce | ~1s coalesced after L2 send/receive | Immediate persist every message |
| Hide | Mobile `background`/`screenOff` + web `visibilitychange`/`pagehide` | Exit-only |
| OFF hydrate | Skip L2 rows from `chatRooms` | Wipe blob on toggle flip |
| Room key for prune | `parseChatSmartBody` → `action === "relay"` + `roomId` | New `roomId` column on `SdkMessageRecord` |
| Housekeeping | Same `leaveRoom` / `retireExpiredRooms` path | Separate job/worker |
| History model | Keep sealed L2 frames + local wallet persist | Shared Hypercore log (Keet-style catch-up) |

**Why sealed frames (not a shared log).** Rooms are TTL-bounded (default 7 days,
max 30) and leave-forever must drop local copies. A Hypercore log is better for
peer catch-up and multi-device, worse for size (log + merkle + replication
state), privacy (peers learn history length; delete is not global), and our
revoke/TTL story. Local persist of frames this device already saw is enough for
hop-out. Catch-up is a later change.

## Risks / Trade-offs

- [Text history vs blob size] → Bounded by room TTL (1–30 days) then wiped; text is small.
- [Stale L2 bytes after toggle OFF] → Hydrate ignores them; destroy path tombstones.
- [Frequent persist on busy L2] → UI never waits; ~1s background coalesce; hide/Exit flush immediately.
- [Hide flush races lock] → No-op if runtime already locked; never throw into UI.
- [L1′ parse misses malformed bodies] → Fail closed: leave the row (do not delete non-relay).
- [Missed L2 while offline] → Accepted until a later catch-up protocol; L1′ covers paid fallback.

## Migration Plan

No blob schema version bump. Existing `chatRooms` and `sentMessages` stay.
Users with the old label see the new copy; default remains ON. Rollback is
revert: hide flush stops; Exit gate and hydrate revert to prior behavior.

## Open Questions

None that change specs or task breakdown.
