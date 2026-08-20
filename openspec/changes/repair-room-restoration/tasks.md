# Tasks: repair-room-restoration

## 1. Remove false restore paths (7e713a3)

- [ ] 1.1 Stop calling `planRoomRestores` on seed/key unlock, resync, and
  `refreshInvites` unless import was `method: "file"`.
- [ ] 1.2 Remove/gate placeholder handshake and `contact.roomId`-only restore in
  `roomChainRestore.ts`.
- [ ] 1.3 Audit `ConcealSmartMessageAdapter.fetchIncomingMessages` — sent merge
  must not drive cross-device room restore.

## 2. File-import replay

- [ ] 2.1 Refactor `planRoomRestores({ restoreFromFileImport })`:
  - [ ] Parse creates from `sentMessages` + `receivedMessages`
  - [ ] Case 1: `roomTtl` past → skip
  - [ ] Case 2: no accept + `inviteExpiry` past → silent skip +
        `rememberRevokedRoom(roomId, inviteId)`
  - [ ] Case 3: no accept + `inviteExpiry` future → pending
  - [ ] Case 4: create + accept + valid `roomTtl` → catalog +
        `awaitingChainSync: true`
- [ ] 2.2 Wire `restoreFromFileImport: true` from `walletStore.importWallet`
  when `method === "file"` only.
- [ ] 2.3 Chats UI: tile visible but not openable when `awaitingChainSync`;
  clear flag at near tip if no revoke.

## 3. Tests

- [ ] 3.1 `tests/p2p/room-chain-restore.test.ts`:
  - [ ] Non-file import → empty plan
  - [ ] Case 1–4 table
  - [ ] Case 2 writes revoked tombstone, no catalog tile
  - [ ] Case 4 enables after near tip
  - [ ] On-chain revoke during sync removes room
- [ ] 3.2 Seed import path: no `planRoomRestores` side effect (integration or store test).

## 4. Docs

- [ ] 4.1 `docs/security/p2pchatprotocol.md` — file-only replay, asymmetric chain
  visibility, two-phase gates.
- [ ] 4.2 `docs/features/lite-wallet.md` — Import vs Backup; resync ≠ rooms.
- [ ] 4.3 `docs/decisions.md` — ADR snippet.

## 5. Verify

- [ ] 5.1 `npm run types`
- [ ] 5.2 `npm test -- tests/p2p/room-chain-restore.test.ts`
