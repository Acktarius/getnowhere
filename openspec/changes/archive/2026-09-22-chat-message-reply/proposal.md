## Why

1:1 chat rooms need a SimpleX/Keet-style way to answer a specific peer message. Users already have long-press actions (copy/edit/delete); without reply, they can only quote manually or lose context in a long thread.

## What Changes

- Add a **Reply** arrow to the message action menu when the room is **online (L2 connected)** and the target is a **live, non-deleted peer** bubble.
- Pending reply shows a **grey truncated preview** above the composer; typing/send stay the same; click/tap away from the input **cancels** the pending reply.
- Sent/received reply messages remain `kind: "text"` but carry optional `replyToMessageId` + frozen `replyPreview`; the bubble renders the grey truncated quote above the new text.
- Extend live `ChatContentEnvelopeV1` with the same optional fields; **no** reply metadata on L1′ relay.
- Update protocol docs (`docs/security/p2pchatprotocol.md` §14, and related UI notes as needed).

## Capabilities

### New Capabilities

- `chat-message-reply`: L2-only in-thread reply quoting (UI gating, composer pending state, envelope fields, bubble rendering).

### Modified Capabilities

- (none)

## Impact

- UI: `MessageBubble.tsx`, `ChatRoomScreen.tsx` (composer bar + reply state).
- Model/protocol: `ChatMessage`, `ChatContentEnvelopeV1`, `HolepunchChatTransport` send/receive mapping, `chatStore.sendMessage` (optional reply args).
- Docs: `docs/security/p2pchatprotocol.md` (and brief mention in encryption content-envelope notes if AAD/kind list stays `text`).
- Tests: unit/UI coverage for gating, cancel-on-blur, snapshot persistence, envelope round-trip.
- Non-impact: L1′ relay path, reaction/edit/delete kinds, Hyperswarm bridge schema.
