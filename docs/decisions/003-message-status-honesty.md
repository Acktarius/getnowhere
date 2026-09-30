# 003 — Outbound "sent" status and replay after reconnect

Status: **Accepted**  
Date: 2026-09-30  
Source: `openspec/changes/archive/2026-09-30-message-status-honesty`

## Context

Outbound live messages were marked `delivered` (✓✓) right after the
fire-and-forget `sendFrame`, and L1′ relay success did the same. When the peer
was flapping on L2, a frame could be dropped while the sender still saw ✓✓.
There is no peer ACK in the protocol.

## Decision

1. Outbound messages end at `sent` (one ✓): the frame reached the bridge, or the
   L1′ broadcast was accepted. `delivered` is inbound-only until a peer ACK
   exists. Legacy outbound `delivered` rows render as one ✓.
2. Live seal → counter persist → `sendFrame` runs one at a time per room, for
   content and proof frames. Counter write-backs only raise the counter.
3. After a reconnect whose proof succeeds, the sender re-seals the last 3 live
   envelopes sent in the past 5 min, oldest first, 300 ms apart. Receivers drop a
   repeated inbound `messageId`. This is best effort, in memory, and not an outbox.

## Consequences

- The sender no longer sees delivery confirmation. A future peer ACK restores ✓✓
  and needs a protocol change (`docs/security/p2pchatprotocol.md`).
- Each proven reconnect can spend up to 3 extra send counters per room.
- Losses beyond 3 messages, older than 5 min, or across a sender restart are not
  recovered.
- Mobile counter durability (F3) and receive-window resync (F4) remain open.
