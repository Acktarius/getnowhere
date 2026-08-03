# Nav Exit, leaveRoom, and Encrypted Room History

## Why

Chat transport `disconnect` means leave-forever, which confuses it with wallet
session disconnect. Operators need a clear Exit on the bottom nav that locks the
wallet and returns to open/welcome, while keeping the wallet and room history on
device. Chat messages today live only in RAM, so Exit or reinstall loses
conversation content even when the room is still valid.

## What Changes

- Rename chat `disconnect(roomId)` → `leaveRoom(roomId)` (behavior unchanged:
  leave forever + revoke path).
- Reorder bottom nav: Chats → Contacts → Wallet → Settings → Exit (door).
- Exit shows **Confirm disconnect**; on confirm: flush wallet blob (incl. room
  transcripts), soft-leave Holepunch topics (no revoke), lock/disconnect
  runtime, navigate to `/welcome`.
- Extract `ConfirmModal` to `src/components/ConfirmModal.tsx` with generic busy
  labels; migrate Settings delete-wallet / reset-app off `window.confirm`.
- Persist active room transcripts inside the encrypted `"wallet"` blob (wallet
  password). On unlock, hydrate messages from the blob.
- On revoke / `leaveRoom`, strip room content and keep only
  `{ roomId, revoked: true }` so the same id cannot be re-seeded.

## Capabilities

- `app-data-lifecycle`: ConfirmModal standardization; Settings confirms; nav Exit
  wallet disconnect (delta: `specs/app-data-lifecycle/spec.md`).
- `chat-room-persistence`: leaveRoom rename; wallet-blob transcripts; revoke
  tombstone (delta: `specs/chat-room-persistence/spec.md`).

## Impact

Touches `BottomNav`, `ConfirmModal`/`Sheet`, Settings wipe UX, chat transport
API, contactsStore leave call sites, wallet `RawWalletV1` extension for room
history, encryption/protocol docs. Peer catch-up and Hypercore replication are
out of scope. Uninstall still clears localStorage unless the user has an export
backup.
