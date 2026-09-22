# Design: Nav Exit, leaveRoom, Encrypted Room History

## Context

- Chat `disconnect(roomId)` is leave-forever; wallet `runtime.disconnect()` /
  `lockWallet()` clears keys from RAM. Naming collision confuses product flows.
- Messages live in `HolepunchChatTransport` memory map only.
- Contacts already dual-write to `gnh.contacts` and encrypted
  `raw.addressBook`. Transcripts follow the wallet-blob pattern only (no plain
  local cache in this change).
- `gnh.revokedRooms` already blocks re-seed; blob tombstones become the
  encrypted durable form and must stay consistent with that gate.

## Decisions

| Topic | Choice | Alternatives rejected |
|-------|--------|------------------------|
| Leave-forever name | `leaveRoom(roomId)` | Keep `disconnect` (ambiguous) |
| Transcript store | Field on encrypted wallet `raw` (e.g. `chatRooms`) | Separate localStorage key (second persist path) |
| Revoke residual | `{ roomId, revoked: true }` only | Full delete; `revokedAt` metadata |
| Exit confirm | Shared `ConfirmModal` | `window.confirm` |
| Confirm component path | `src/components/ConfirmModal.tsx` | Keep inside `Sheet.tsx` |
| Soft-leave on Exit | Leave Hyperswarm topics without catalog destroy | Call `leaveRoom` (would revoke) |
| Message save gate | `privacy.localMessageRetention` (default on) | Always save; separate new setting |

## Exit sequence

```text
Confirm disconnect
  → persist contacts; if localMessageRetention: save chat messages into raw.chatRooms
  → persistRuntime (encrypt wallet blob)
  → soft-leave all joined topics (backend leave; keep catalog/sessions)
  → wallet disconnect / lock (forget RAM keys)
  → clear app session (initialized false) → navigate /welcome
```

## Room blob shape (pragmatic)

```ts
// Inside RawWalletV1 (encrypted at rest with wallet password)
chatRooms?: Record<string, ChatRoomBlobEntry>;

type ChatRoomBlobEntry =
  | { roomId: string; revoked: true }
  | {
      roomId: string;
      revoked?: false;
      messages: /* ChatMessage-serializable rows */;
    };
```

Hydrate on unlock / open room: if entry is revoked, treat as blocked; else seed
`messagesByRoom`. **Save** messages on Exit **only when** Settings privacy
`localMessageRetention` is on (default on). When off, Exit still persists the
wallet blob for contacts/etc. but does **not** write chat message bodies into
`chatRooms`.

## Risks

- Extending `RawWalletV1`: if SDK types are strict, use a documented extension
  field the persist path already round-trips (same pattern as addressBook).
- Large transcripts grow the encrypted blob; MVP accepts that; no pruning yet.
- Soft-leave vs catalog: rooms remain listed after Exit; reconnect on reopen.

## Out of scope

- Peer history catch-up over L2+L3.
- Hypercore / shared replication.
- Plaintext `gnh.chatTranscripts` mirror.
