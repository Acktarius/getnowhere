# Design — L1′ relay background notifications

## Context

See `proposal.md`. Existing pieces:

- `notificationStore.roomRelayUnread` + `noteRelayIngested` (Chats list pins)
- `useWalletLiveSync` polls sync/invites/relays but **returns early when hidden**
- Invite/register pins on `ContactCard`; relay pins not on contact surfaces
- `markRoomSeen(roomId)` on `ChatRoomScreen` mount clears room relay unread

Brainstorm decisions: `.forge/sessions/20260812T235202Z-background-message-notifications-271631/brainstorm/`

## Goals / Non-Goals

**Goals:**

- Background L1′ ingest while wallet unlocked (slower cadence when hidden)
- Scope C UI: Chats + Contacts list + Contact detail per room/topic
- Active-room suppression; bootstrap guard unchanged

**Non-Goals:**

- L2 badges, OS push, persisted unread across lock, background Hyperswarm sessions

## Decisions

### D1 — Remove visibility skip; dual cadence

**Choice:** Delete the early return in `useWalletLiveSync` tick when hidden.
Use foreground cadence (2.5s catching up / 20s near tip) when visible; use a
fixed **30s** background interval when hidden (tunable constant).

**Alternatives:** Host-specific rules (rejected — user wants same rule everywhere);
foreground-only (rejected).

**Rationale:** Unlocked wallet must stay in sync until Exit; slower hidden poll
balances battery.

### D2 — Contact relay selectors computed from rooms

**Choice:** Add `contactRelayBadge(contactId, rooms)` and extend
`anyContactBadge` to OR in contact-level relay. No separate persisted map.

**Rationale:** `roomRelayUnread[roomId]` remains source of truth; rooms carry
`contactId` + `roomTopic`.

### D3 — Active-room suppression via small helper

**Choice:** `shouldSuppressRelayBadge(roomId)` checks `chatStore.activeRoomId`
and current pathname `/chats/:roomId`. Call from `refreshRelays` before
`noteRelayIngested`.

**Alternatives:** Only `markRoomSeen` (rejected — race when relay arrives while
in room then user navigates away).

### D4 — Contact detail room list

**Choice:** New section on `ContactDetailScreen` listing
`listCatalogRooms().filter(r => r.contactId === id)` with topic icon, lifecycle
hint, relay pin, link to `/chats/:roomId`. Reuse `ChatsScreen` row patterns.

### D5 — Background poll work set

**Choice:** Hidden ticks run `sync()`, `refreshInvites()`, `refreshRelays()`.
Keep `refreshBalance()` on foreground ticks only (UI-oriented; optional on
hidden — implementer may include for parity; spec does not require it).

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Battery drain from hidden polling | 30s background interval; no 2.5s spam when hidden |
| Stale pin after in-room receive | Active-room suppression + markRoomSeen |
| Contact detail clutter with many rooms | Same catalog source as multi-room product rules |
| `resetSession()` on live sync mount wipes badges | Existing behavior; document; only runs on wallet init hook |

## Migration Plan

No migration. Ship behind existing unlocked-wallet poll; no schema changes.

## Open Questions

None — brainstorm decisions closed.
