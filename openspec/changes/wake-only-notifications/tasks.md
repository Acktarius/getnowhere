## 1. Gateway poke kind and fixed payload

- [x] 1.1 **Superseded:** do not add `kind`. Deployed gateway stays `{ to }` only.
- [x] 1.2 **Superseded:** no poke-gateway payload change / no redeploy.
- [x] 1.3 Client `sendPoke` body is exactly `{ to }` (matches live gateway)

## 2. Client poke API and L1′ trigger

- [x] 2.1 Extend `sendPoke(handle, kind)` and failing client tests (`poke-gateway-client`, `poke-trigger`)
- [x] 2.2 Pass `new_message` from `maybeSendPoke`; keep 300s cooldown, skip when wake off / no handle, clear last-poke on L2 connected

## 3. Invite-accepted wake

- [x] 3.1 Add failing tests: successful `chat.register` send attempts `invite_accepted` when wake is on and initiator handle is stored; skip when wake off or handle missing; accept still succeeds
- [x] 3.2 Call `sendPoke(initiatorHandle, "invite_accepted")` after a successful register broadcast

## 4. Local banners without content

- [x] 4.1 Add failing tests: invite-received maps to `You received a room invite`; known-room L1′ ingest does not publish a native content banner
- [x] 4.2 Stop `l1_known_room_message` native publish; keep invite-received generic; in-app unread unchanged
- [x] 4.3 Use local notification ids prefixed `gnh.local.`

## 5. iOS icon pin vs Notification Center

- [x] 5.1 Change Swift `clearBadge` test: badge 0 MUST NOT call `removeAllPendingAndDelivered`
- [x] 5.2 Implement badge-only clear; keep bulk remove only for privacy-off / cancel-all
- [x] 5.3 Confirm iOS foreground still calls badge clear (App.tsx)

## 6. Settings and docs

- [x] 6.1 Update Settings copy: Wake contact = invite accepted + new message; banner = invite received only
- [x] 6.2 Update `docs/features/peer-wake-notification.md` and `docs/features/local-background-notifications.md`

## 7. Product loop

- [x] 7.1 Author / refresh `e2e.json` steps that prove gateway kind mapping and client poke-trigger + accept-poke + no L1′ content banner (unit harness)
- [x] 7.2 Run `forge e2e run` for this change (or record BLOCKED only for physical APNs)
