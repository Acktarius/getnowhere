## Context

See proposal.md — Why. Today `MessageBubble` long-press/click opens Copy / Edit / Trash; `ChatContentEnvelopeV1` supports `text|reaction|edit|delete|proof` with optional `targetMessageId` / `reaction`. Live vs relay is `channel: live|relay`. Room “online” for compose already maps to `lifecycleStatus === "connected"` (`holepunchLive` in `ChatRoomScreen`).

## Goals / Non-Goals

**Goals:**
- Minimal wire change: keep `kind: "text"`; add optional `replyToMessageId` + `replyPreview`.
- Gate Reply on L2 connected + inbound live + not deleted.
- Composer pending state with cancel-on-blur/outside-input.
- Render frozen grey quote on bubbles that carry `replyPreview`.

**Non-Goals:**
- New `kind: "reply"`.
- Reply on L1′ / offline / own messages / deleted parents.
- Group rooms / author labels.
- Scroll-to-parent on quote tap (defer).
- Nested quote-of-quote rendering inside the preview.

## Decisions

1. **Optional fields on text, not a new kind**  
   Rationale: matches product (“regular bubble + truncated reference”); avoids AAD/kind churn and merge special-cases.  
   Alternative rejected: `kind: "reply"`.

2. **Snapshot string in envelope**  
   `replyPreview` is truncated at compose time (e.g. ~80–120 chars + ellipsis) and sent to the peer so both sides render without looking up the parent.  
   Alternative rejected: id-only + local lookup (breaks on edit/delete).

3. **Reuse `targetMessageId` vs new field**  
   Use dedicated `replyToMessageId` so reaction/edit/delete semantics stay unambiguous (`targetMessageId` already means those ops).  
   Alternative rejected: overloading `targetMessageId` for text replies.

4. **Gating source of truth**  
   UI: show Reply only when `lifecycleStatus === "connected"` AND `message.channel !== "relay"` (treat missing channel as live for legacy) AND `direction === "in"` AND not deleted. Transport: ignore/strip reply fields if somehow sent on relay path.

5. **Cancel semantics**  
   Pending reply clears on pointer/focus leaving the composer input (and on explicit dismiss if we add an X on the preview). Send clears pending reply after enqueue.

5b. **Action strip placement**  
   Reply arrow sits **beside the Edit pencil** in `msg-reaction-picker__actions` (order: Copy → Reply → Edit → Delete → Close). Reply may show without Edit (peer messages); Edit still own-only.

6. **Docs**  
   Update `docs/security/p2pchatprotocol.md` §14 envelope field list; note reply is live-only like reaction/edit/delete.

## Risks / Trade-offs

- [Risk] Oversized `replyPreview` on wire → Mitigation: hard truncate before set; keep well under existing frame limits.  
- [Risk] Old clients ignore unknown fields → Mitigation: additive optional JSON fields; old clients show text only (acceptable).  
- [Risk] Cancel-on-outside-click fights reaction picker / buttons → Mitigation: only clear when leaving composer input after reply started; do not clear on Send button press.  
- [Trade-off] Snapshot can disagree with later parent edits → Accepted by product.

## Migration Plan

- Additive fields only; no storage migration required beyond persisting new optional keys on `ChatMessage` / live transcript.  
- Rollback: ignore reply fields in UI; older builds remain interoperable for plain text.

## Open Questions

- Exact truncation length (default **100** Unicode code points + `…` unless UX tweaks later).  
- Whether preview dismiss “X” is required in v1 (outside-click cancel is mandatory; X is optional polish).
