# L1′ chat relay (grey bubbles)

**Status:** Implemented. Spec: `docs/security/p2pchatprotocol.md` §16.

When Hyperswarm (L2) is not connected but the invite was **accepted**, text can
ride Conceal smart messages (**L1′**). Live Holepunch remains preferred.
**Pending never allows send** (no spam before Accept).

## Channels

| Channel | Transport | Bubble |
|---|---|---|
| `live` | Holepunch frame (L2 Noise + L1 session seal) | Accent |
| `relay` | L1′ `{contact,e,roomId,ts,text}` | Grey |

Conceal MESSAGE already encrypts with ChaCha + DH. App body is plain fields.
L1′ does **not** replace L2. Same `roomId` thread mixes both channels.

**Persist / hydrate:** Mined L1′ sent bodies are written to `raw.sentMessages` at
broadcast (paid). Inbound lands in `receivedMessages` on scan. Unlock merges
those `{contact,e,roomId,…}` rows into the room thread regardless of **P2P
message retention**. That setting gates L2 (live) `chatRooms` only. Expire /
revoke / leave-forever tombstones `chatRooms` and drops matching L1′ `e` copies.
Mempool-TTL L1′ never writes to `chatRooms`; at expiry erase from both rooms
and do not restore on unlock. Wallet history drops the matching pending 0-conf
row at the same expiry (do not keep it for the 24h mempool lifetime).

## Composer

- Prefer `live` when `lifecycleStatus === "connected"`.
- Allow `relay` for `accepted` | `connecting` | `connect_failed`.
- `pending` / terminal → blocked.
- Subtle “via chain” hint when the next send is relay.
- Tap send = Conceal TTL 0 (mined, paid, durable). Long-press flyout: **60 min**
  (top), **6 min** (middle). Flyout only on chain fallback, not live.

## Inbound refresh

- Open room always rescans L1 relays ~every 2.5s (Holepunch can fail mid-chat; L3 stays live).
- Also rescans on enter and when lifecycle becomes relay-eligible.
- Global wallet poll calls `refreshRelays` while the wallet is unlocked — foreground
  uses 2.5s / 20s cadence; **background** (hidden tab/window) uses 30s until Exit.

## Relay notification pins

In-app pins (`NotifyPin`) for unread L1′ relay on post-accept rooms:

| Surface | Pin |
|---------|-----|
| Chats list row | per-room relay count |
| Chats tab | aggregate |
| Contacts list row | per-contact aggregate |
| Contact detail | per room/topic row |
| Contacts tab | aggregate (invites, register, relay) |

Pins clear when the user opens that room. Exit/disconnect clears session state.
Invite/register pins unchanged. L2 live messages are not badged.

## Limits

- Text only; no `,` `{` `}` in body (smart-message delimiters).
- Fit `MAX_MESSAGE_BODY_BYTES` (~200 chars).
- Reaction / edit / delete stay live-only.
- Dedupe by `roomId + sentAt + text`.

## Coding constraints

Do not import `hyperswarm` in UI. See `docs/prompts/coding-constraints.md`.
