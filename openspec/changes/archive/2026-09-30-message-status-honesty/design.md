# Design

## Context

See proposal.md — Why. `HolepunchChatTransport.sendContent` seals, calls the
fire-and-forget `backend().sendFrame`, then notifies the outbound row as
`delivered`. The sidecar writes to the swarm connections that exist at that
instant. Reconnect runs `attemptConnect` → `waitForProof` → `connected`
(~L800-815). `P2PEncryptionAdapter.seal` reads `session.sendCounter`
synchronously and the caller writes `state.session` back after an `await`.
The receiver's `mergeContentMessage` already ignores a duplicate inbound id,
but `notify` still calls subscribers with it. Remote ingress allows a 20-frame
burst and 10 frames/s.

## Goals / Non-Goals

**Goals:**
- Status and icons that never overstate delivery.
- Recover the common "flap right after send" loss without a protocol change.

**Non-Goals:**
- Peer ACK, durable outbox, ordering by `createdAt`.
- Fixing counter durability on mobile (F3) or receive-window resync (F4). While
  F4 is triggered, replayed frames fail to open like any other frame.

## Decisions

- **New `sent` status instead of reusing `sending`.** `sending` must keep
  meaning "not yet accepted" (relay broadcast pending). Alternative: rename
  `delivered` — rejected, inbound rows use it correctly and a future ACK needs it.
- **Legacy outbound `delivered` renders as one check.** Avoids a transcript
  migration; the value simply stops being written for outbound rows.
- **`sealAndSendLiveFrame(state, envelope)` behind a per-room promise chain.**
  Both `sendContent` and replay go through it, so seal → counter persist →
  `sendFrame` never interleaves. It throws when `session` or `topicRef` is
  missing. Alternative: synchronously reserve a counter before `seal` —
  rejected, the chain is simpler and also orders replay against new sends.
- **Replay list keyed by room: `{ envelope, sentAtMs }[]`, max 3, 5 min.**
  `rememberLiveSend` drops expired entries and the same `messageId`, keeps the
  original `sentAtMs` so entries age out even across repeated reconnects.
  Replay reads, prunes, and sends; it does not delete, so a second flap within
  the window replays again. Cap 3 at 300 ms keeps replay far under ingress limits.
- **Replay does not `notify` locally.** Re-notifying the original text would
  overwrite a later local edit via `mergeContentMessage`.
- **Hook after proof success only**, right after `emitRoom` in `attemptConnect`.
  The peer is authenticated there; `maybeMarkConnected` on peer count alone is
  not a trigger. A `resendingRooms` set prevents parallel batches per room.
- **Receiver short-circuit in `handleIncomingFrame`** before building the
  message: if an inbound row with that id exists, return after
  `touchLastLiveAt` (a repeat still proves liveness). Edit/delete envelopes are
  not stored as rows, so they re-apply idempotently.
- **Clear points:** `leaveRoom`, the revoked branch of `ensureRoom`, the catalog
  prune in `listRooms`, `__resetHolepunchTransport`, and a new exported
  `clearRecentLiveSends()` called from `walletStore.lock()`.

## Risks / Trade-offs

- [Recovered message shows at the bottom on the receiver] → it keeps its
  original timestamp; sorting is out of scope.
- [Sender app killed or loss > 3 messages] → not recovered; ACK work later.
- [Replay burns send counters] → 3 frames per successful reconnect; small next
  to proof retries. F4 tracks the window problem.
- [Receiver restarted with retention off sees a repeat within 5 min] → accepted.

## Migration Plan

No data migration. Old and new clients interoperate: an old receiver ignores a
repeated id via `mergeContentMessage` (it may re-notify subscribers once).
Rollback is a code revert.
