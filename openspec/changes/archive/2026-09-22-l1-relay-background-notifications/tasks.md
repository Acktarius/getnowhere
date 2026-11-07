# Tasks — L1′ relay background notifications

## 1. Background sync

- [x] 1.1 Remove visibility early-return in `useWalletLiveSync`; add `BACKGROUND_POLL_MS` (30s) when hidden
- [x] 1.2 Keep immediate tick on `visibilitychange` → visible
- [x] 1.3 Add hook test: hidden visibility still schedules relay refresh (mock timers + visibility)

## 2. Notification store

- [x] 2.1 Add `contactRelayBadge` / extend `anyContactBadge` for contact-level relay aggregate
- [x] 2.2 Add `shouldSuppressRelayBadge(roomId)` helper (active room + route)
- [x] 2.3 Unit tests for contact aggregate, suppression, bootstrap guard regression

## 3. Relay ingest wiring

- [x] 3.1 Gate `noteRelayIngested` in `chatStore.refreshRelays` with suppression helper
- [x] 3.2 Integration test: relay ingested while not on room screen increments badge

## 4. UI — Contacts surfaces

- [x] 4.1 `ContactCard`: relay pin after invite/register priority
- [x] 4.2 `ContactDetailScreen`: Rooms section with per-topic rows + relay pins
- [x] 4.3 `useNavNotificationBadges`: Contacts tab dot includes relay aggregate

## 5. Docs + verify

- [x] 5.1 Update `docs/features/chat-relay.md` (background poll, pin surfaces)
- [x] 5.2 Run scoped unit tests + typecheck (`forge e2e run`)
