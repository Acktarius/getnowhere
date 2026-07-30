# Multiple Rooms Per Contact

## Why

A contact stores a single `roomId`. Opening any older room shows a
“superseded / no longer current” banner whenever that pointer differs, and
creating a new invite for the same `roomTopic` auto-abandons prior rooms.
Operators need multiple concurrent rooms with the same contact (different
topics and/or TTLs). Accept/decline of a *new* invite must stay familiar.

## What Changes

- Stop auto-abandoning prior rooms on create; every invite is a new room.
- Confirm before create when an open room already exists for that
  contact + `roomTopic`.
- Remove the ChatRoom superseded banner driven by `contact.roomId !== roomId`.
- Update Resend copy so it no longer claims the peer’s current room ends.
- Update protocol docs: multiple rooms allowed; same-topic create needs
  confirm; Leave/revoke ends rooms explicitly.

## Capabilities

- `p2p-chat-connectivity`: Multi-room per contact; no auto-supersede; same-topic
  create confirm (delta: `specs/p2p-chat-connectivity/spec.md`).

## Impact

Touches `contactsStore` create path, `ContactDetailScreen` confirm UX,
`ChatRoomScreen` banner, and `docs/security/p2pchatprotocol.md`. Invite crypto
and topicRef derivation unchanged. No durable schema migration required;
`contact.roomId` remains a latest-room hint only.
