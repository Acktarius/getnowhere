# L1 chat relay (grey bubbles)

**Status:** Implemented. Spec: `docs/security/p2pchatprotocol.md` §16.

When Hyperswarm is not connected but the invite was **accepted**, text can ride
Conceal smart messages. Live Holepunch remains preferred. **Pending never
allows send** (no spam before Accept).

## Channels

| Channel | Transport | Bubble |
|---|---|---|
| `live` | Holepunch frame (L2 Noise + L3 seal) | Accent |
| `relay` | L1 `{contact,e,roomId,ts,text}` | Grey |

Conceal MESSAGE already encrypts with ChaCha + DH. App body is plain fields.
Relay does **not** replace L2.

## Composer

- Prefer `live` when `lifecycleStatus === "connected"`.
- Allow `relay` for `accepted` | `connecting` | `connect_failed`.
- `pending` / terminal → blocked.
- Subtle “via chain” hint when the next send is relay.

## Inbound refresh

- Open room always rescans L1 relays ~every 2.5s (Holepunch can fail mid-chat; L3 stays live).
- Also rescans on enter and when lifecycle becomes relay-eligible.
- Global wallet poll also calls `refreshRelays` (slower when near tip).

## Limits

- Text only; no `,` `{` `}` in body (smart-message delimiters).
- Fit `MAX_MESSAGE_BODY_BYTES` (~200 chars).
- Reaction / edit / delete stay live-only.
- Dedupe by `roomId + sentAt + text`.

## Coding constraints

Do not import `hyperswarm` in UI. See `docs/prompts/coding-constraints.md`.
