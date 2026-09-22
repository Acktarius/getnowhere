# L1′ relay background notifications

## Why

When a user keeps Get NowHere open with an unlocked wallet but is not viewing a
chat, inbound L1′ relay messages (`{contact,e,roomId,ts,text}`) are not reliably
fetched or surfaced. Invite/register pins already work for L1 lifecycle events;
relay chat needs the same in-app visibility across Chats and Contacts, including
while the app is in background (slower poll for battery).

## What Changes

- Continue wallet sync + L1′ relay ingestion when the tab/window is hidden (slower
  interval than foreground); stop only on Exit/disconnect.
- Extend in-app relay unread pins to Contacts list, Contact detail (per
  room/topic), and Contacts tab dot (Chats surfaces already partially wired).
- Suppress relay unread increment while the user is actively viewing that room.
- Update `docs/features/chat-relay.md` for background poll and notification
  surfaces.

## Capabilities

### New Capabilities

- `chat-relay-notifications`: Background L1′ ingest while wallet unlocked;
  session-scoped relay unread pins on Chats + Contacts surfaces; clear on room
  open; no OS push.

### Modified Capabilities

<!-- none — invite/register notification behavior unchanged -->

## Impact

- `src/hooks/useWalletLiveSync.ts` — visibility / poll cadence
- `src/state/notificationStore.ts` — contact-level relay selectors
- `src/state/chatStore.ts` — relay ingest + active-room suppression hook
- `src/components/ContactCard.tsx`, `src/screens/contacts/ContactDetailScreen.tsx`
- `src/hooks/useNavNotificationBadges.ts`
- `docs/features/chat-relay.md`
- Unit tests under `tests/state/`, `tests/hooks/`

## Non-goals

- L2 live message badges
- Background Hyperswarm room sessions
- OS app-icon badge / push (native-wrapper later)
- Persisting unread counts across wallet lock
