# Proposal

## Why

Outbound L2 live messages show a double check mark the moment the frame is
handed to the sidecar, which drops frames silently when the peer is gone or
flapping. Senders read ✓✓ as "delivered/read" for messages the recipient never
received. There is no peer ACK, so the app cannot honestly claim delivery.

## What Changes

- Add an outbound `sent` status meaning "the transport accepted the message"
  (L2 socket write or L1′ broadcast accepted). `delivered` is reserved for a
  future peer ACK and is no longer set on outbound messages.
- Bubbles render one check for sent, a clock while sending, the existing
  queued label and failure icon. No double check is rendered.
- A live send with no topic fails instead of being marked sent.
- Live seal + send is serialized per room so two sends never use the same
  session counter.
- After an L2 reconnect with a successful post-connect proof, the sender
  replays its last 3 live envelopes from the past 5 minutes, oldest first,
  300 ms apart, re-sealed with fresh counters (best effort, in memory only).
- The receiver ignores a live envelope whose message id it already holds.

## Capabilities

### New Capabilities

- `chat-message-delivery`: outbound message status semantics and best-effort
  live resend after reconnect, including receiver idempotency.

### Modified Capabilities

(none)

## Impact

- Code: `src/types/models.ts`, `src/components/MessageBubble.tsx`,
  `src/services/p2p/HolepunchChatTransport.ts`, `src/state/chatStore.ts`,
  `src/services/mock/MockChatTransport.ts`; tests under `tests/p2p/` and
  `tests/screens/`.
- Docs: `docs/security/p2pchatprotocol.md` §14 (live envelopes may be
  retransmitted; receivers treat `messageId` as idempotent),
  `docs/features/chat-relay.md` (status meanings).
- No wire-format change. Persisted outbound rows with `delivered` keep
  rendering as a single check; no migration.
- Out of scope: L1′ fallback behaviour, peer ACK, link liveness and status-label
  wording, session counter durability (F3) and receive-window resync (F4).
