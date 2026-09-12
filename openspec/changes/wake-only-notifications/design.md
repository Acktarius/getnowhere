## Context

See proposal.md — Why. Correction: two APNs strings require a poke-gateway
redeploy. That is out of scope. The deployed gateway already accepts
`POST /poke { to }` (`additionalProperties: false`) and shows
`Get NowHere` / `New message`.

## Goals / Non-Goals

**Goals:**

- App sends only `{ to }` so the live gateway keeps working.
- Poke on accept and on L1′ (300s re-poke, clear on L2) using that same request.
- Persist initiator handle on the invite so accept can poke without a catalog row.
- Strip L1′ preview from local publish; keep invite-received generic and local.
- Split iOS badge clear from Notification Center wipe.

**Non-Goals:**

- Redeploying or changing poke-gateway.
- A `kind` field on `/poke`.
- Two different lock-screen sentences for accept vs message.
- Device-level handle for first-invite APNs.
- Changing wake default (stays off).

## Decisions

1. **One wake.** Accept and L1′ both call `sendPoke(handle)` → `{ to }`. The OS
   shows whatever the deployed gateway already sends. Alternative (two kinds)
   rejected: it cannot ship without a gateway deploy.

2. **Invite handle on the invite record** (`initiatorPokeHandle`) so accept
   still pokes when `storePartnerPokeHandle` no-ops (no catalog row yet).

3. **Invite received stays local after sync.** No poke — no handle yet.

4. **iOS `clearBadge` = badge 0 only.** Bulk remove stays on privacy-off.

5. **Do not touch poke-gateway source** except to leave it on the deployed
   contract (revert any in-tree `kind` work).

## Risks / Trade-offs

- [Accept and new-message look identical on the lock screen] → Accepted. Users
  open the app to see which event it was.
- [APNs env / registration still broken] → Unchanged; not this change.
- [Android badge follows notifications] → Unchanged; #15 is iOS.

## Migration Plan

- Ship the app only. No gateway release.
- Rollback: revert the app. Gateway never changed.

## Open Questions

- None.
