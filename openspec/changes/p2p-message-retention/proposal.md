# P2P message retention

## Why

Users treat leaving the app (home, app switcher, or nav Exit) as “my chat will
still be here.” Live (L2) history is RAM-only unless they Exit with **Local
message retention** on. Hop-out plus OS kill drops Holepunch messages. Paid L1′
sends already sit in the wallet blob but the room thread does not rebuild them.

## What Changes

- Rename Settings **Local message retention** to **P2P message retention**
  (default ON). OFF scopes **L2 only**: do not write or hydrate Holepunch
  history. L1′ sent always persist while the room is available.
- Persist L2 into encrypted `raw.chatRooms` when the toggle is ON: debounced on
  send/receive, immediately on app hide, and on Exit. Exit is a clean unmount,
  not the only save.
- On unlock, merge L2 from `chatRooms` (if toggle ON) with L1′ from
  `sentMessages` / `receivedMessages` (parse `{contact,e,roomId,…}`).
- On expire / revoke / leave-forever: keep the `chatRooms` tombstone and drop
  matching L1′ `e` rows from sent/received stores. No separate housekeeping job.

## Capabilities

### New Capabilities

- `chat-room-persistence`: Layer-aware transcript persist/hydrate, P2P
  retention toggle, hide+Exit+debounce L2 flush, L1′ thread rebuild, destroy-path
  housekeeping.

### Modified Capabilities

- (none — `chat-room-persistence` is not in `openspec/specs/` yet; prior Exit
  flush lived only in the unarchived `nav-exit-leave-room` delta.)

## Impact

Settings privacy copy and `privacy.localMessageRetention` key (keep the key;
change label/semantics). `walletSessionExit`, `saveChatRoomsToWallet` /
`hydrateChatRoomsFromWallet`, mobile `installSyncLifecycleCheckpoint`, web
visibility hide, `leaveRoom` / `retireExpiredRooms`, `messages-store` prune by
parsed `roomId`. Docs: `encryption.md`, `web-vs-wrapper.md`, `chat-relay.md`.
No L1′ wire or fee changes. No second ciphertext store.
