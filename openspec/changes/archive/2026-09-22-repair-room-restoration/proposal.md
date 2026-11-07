# Repair room restoration (file import only)

## Why

Commit `7e713a3` added room restore on wallet rescan that assumed blockchain
replay could rebuild invite handshakes for **any** import path. That is wrong:

- **`chat.create`** bodies are chain-readable only by the **recipient**.
- **`chat.register` / accept** sent outbound are chain-readable only by the
  **recipient of that message** (the initiator for accept).
- **`sentMessages`** are local sender copies — not rebuilt from chain on fresh
  seed/key/QR import.

Seed/key/QR import may still **detect smart-message transactions** (fee dot in
history) for balance accountability, but **must not** recreate chat rooms from
chain scan alone.

The supported cross-device room path is **encrypted JSON wallet file import**
(conceal-next-wallet model): replay from `sentMessages` + `receivedMessages`
in the backup.

## What Changes

- **Remove** chain-scan room restoration wired on seed/key/QR unlock and resync
  (revert scope of `7e713a3` restore paths, keep valid wallet resync UX).
- **Gate `planRoomRestores`** on `importWallet({ method: "file" })` only.
- **Two-phase file replay:**
  1. Wall-clock TTL / invite-expiry pruning at replay (no tip wait).
  2. Accepted rooms (`create` + accept, valid `roomTtl`) cataloged with
     `awaitingChainSync` until near chain tip (revoke may appear during scan).
- **Expired invite without accept:** silent skip in Chats + **revoked tombstone**
  on `roomId` (via `rememberRevokedRoom`) — ID must not be reused.
- **Keep** Settings Resync / Delete and resync — wallet tx sync only, not rooms.
- **Docs + tests** encoding the matrix above.

## Capabilities

- `chat-room-persistence`: file-import replay, TTL gates, revoked tombstone
  (delta: `specs/chat-room-persistence/spec.md`).
- `p2p-chat-connectivity`: awaitingChainSync near-tip gate; no chain room restore
  (delta: `specs/p2p-chat-connectivity/spec.md`).

## Impact

`roomChainRestore.ts`, `walletStore.importWallet`, `contactsStore`,
`chatStore`, `ConcealSmartMessageAdapter` (remove misleading sent scan for
restore), docs. No wire-format changes.

## Non-goals

- Room restore on seed/key/QR/resync.
- Hypercore / peer history replication.
- Moving `gnh.invites` into wallet blob.
