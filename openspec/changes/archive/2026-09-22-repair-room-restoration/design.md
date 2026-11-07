# Design: Repair room restoration

## Context

| Import path | Room restore? | Chain shows |
|-------------|---------------|-------------|
| Encrypted JSON file | **Yes** (replay blob messages) | Txs + bodies from file |
| Seed / keys / QR | **No** | Smart-msg **tx** (dot, fee); body not readable |
| Settings resync | **No** | Re-sync txs/balance only |

Import UI is only available when **no wallet blob exists** (user wiped data).
There is no import-over-existing-blob path.

## Decisions

| Topic | Choice | Rejected |
|-------|--------|----------|
| Restore trigger | `method: "file"` import only | Restore on unlock/resync/seed |
| Replay source | `sentMessages` + `receivedMessages` in file | Chain scan as restore source |
| Expired `roomTtl` | Skip | Catalog expired room |
| Expired `inviteExpiry`, no accept | Silent skip + `rememberRevokedRoom(roomId)` | Show stale invite; allow ID reuse |
| Pending invite (`inviteExpiry` > now, no accept) | Keep as pending | Force accept |
| Accepted + valid `roomTtl` | Catalog + `awaitingChainSync` until near tip | Enable immediately |
| Resync buttons | Keep (wallet integrity) | Remove |
| `planRoomRestores` | Keep, narrowed scope | Delete module |

## File-import replay algorithm

```text
planRoomRestores(contacts, { restoreFromFileImport: true }):
  if not restoreFromFileImport: return []

  for each parsed chat.create from sentMessages ∪ receivedMessages:
    if roomTtl < now: continue                    // case 1
    if no accept and inviteExpiry < now:
      rememberRevokedRoom(roomId, inviteId)        // case 2 — silent skip
      continue
    if no accept and inviteExpiry > now:
      plan pending invite / room                   // case 3
      continue
    if create + accept and roomTtl > now:
      plan accepted room with awaitingChainSync    // case 4

  // never: contact.roomId alone, register-only, placeholder handshake
```

## Near-tip enablement (case 4 only)

Accepted rooms stay **visible but not openable** until `isWalletNearTip()`:

- Clears `awaitingChainSync` when near tip and no `chat.revoke` seen in scan.
- Revoke during scan → room removed / tombstoned per existing rules.

Wall-clock gates (cases 1–3) run **before** tip — no sync wait needed.

## Seed/key/QR UX split

- **Transactions:** smart-message txs visible (accountability, ~0.011 CCX fee).
- **Chats:** empty — no room recreated from chain.

## Revert scope (`7e713a3`)

Remove wiring that calls `planRoomRestores` on:
- seed/key unlock
- `refreshInvites` during chain resync
- `fetchIncomingMessages` sent-row merge used as cross-device restore

Keep from that commit where still valid:
- `awaitingChainSync` plumbing (for file replay)
- `walletSyncTip` helpers
- Settings Resync / Delete and resync
- Orphan contact prune (if independent of false restore)

## Risks

- Operators lose ghost rooms from broken restore — correct.
- File backup missing one side of handshake: case 3 keeps pending if within
  `inviteExpiry`; otherwise case 2 tombstone.

## Out of scope

- L2 session keys in export (`gnh.roomSessions` stays device-local).
- conceal-next-wallet importer field parity (spot-check only).
