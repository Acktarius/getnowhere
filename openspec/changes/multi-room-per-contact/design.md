# Design — Multiple Rooms Per Contact

## Context

Protocol previously stated one live room per `contactId + roomTopic` with
create always superseding. UI amplified that via a singular `contact.roomId`
and a room banner. Product now wants concurrent rooms; same-topic create is
allowed with an explicit confirm.

## Decisions

- **No auto-supersede on create** — remove the `priorForTopic` →
  `abandonPendingInvite` path in `createInvite` / equivalent.
- **Confirm when open room exists for same topic** — open =
  catalog/lifecycle not left/revoked/expired (include pending through
  connect_failed).
- **Remove superseded ChatRoom banner** — do not treat
  `contact.roomId !== roomId` as invalidating the open room.
- **Resend confirm body** — warn about a *second* room, not that the old one
  ends / peer sees superseded.
- **Pending-invite pruning** — “newest received create per contact+topic is
  actionable” may remain for *unaccepted* invites only; must not destroy
  already-accepted rooms.

## Risks / Trade-offs

- Users can accumulate many rooms for one contact; Chats list must remain
  navigable (existing roomTopic labels help).
- `contact.roomId` still points at latest; deep links / contact CTAs should
  prefer that hint without implying other rooms are dead.
