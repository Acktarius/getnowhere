## Context

The existing `poke-gateway` handles APNs registration and poke dispatch. `pokeGatewayClient.ts`
already calls `POST /poke { to: partnerPokeHandle }`. The `ph` field in `chat.create` /
`chat.register` is already parsed and stored as `partnerPokeHandle`. `maybeSendPoke` in
`HolepunchChatTransport` fires on the first L1′ after L2 drops (`lastPokedAt` guard + 5-min
cooldown). Room catalog already clears `partnerPokeHandle` on destroy. Android already has
`RemoteNodeBackgroundSyncScheduler.scheduleSoonRemoteNodeSync`. iOS already has
`RemoteNodeBackgroundRefreshScheduler`. See `docs/features/peer-wake-notification.md`.

## Goals / Non-Goals

**Goals**
- F-Droid Android peers receive wake signals via ntfy without FCM.
- iOS peers continue to receive wake via APNs (gateway unchanged).
- No platform bit on the wire — sender always calls gateway; gateway routes internally.
- Delete all Google/FCM code; no dead code left behind.
- CI: F-Droid APK on `v*-f-droid`; Electron on other `v*`.

**Non-Goals**
- Wake a force-quit F-Droid process (WorkManager remains the recovery path).
- UnifiedPush distributor integration.
- Any new iOS notification path.

## Decisions

### D1: Gateway as the single poke target (no platform bit on wire)

Sender calls `POST /poke { to }` always. Gateway checks its APNs registry; on miss, it POST to ntfy.
Alternative (sender picks path) was rejected: sender would need to know peer's platform, which
leaks OS to the counterparty and adds a type field to the L1 handshake.

### D2: F-Droid mints pokeId locally; no gateway registration

F-Droid generates 10-byte CSPRNG, derives `gnh-<base64url>` topic, subscribes directly to ntfy.
Alternative (gateway mints all pokeIds, F-Droid registers too) adds a registration dependency
for a platform that intentionally avoids centralized services.

### D3: ntfy topic = `gnh-<pokeId>` — topic IS the capability

No separate ntfy ACL delete on room expiry. Forgetting the pokeId locally is sufficient:
80-bit random unguessable topic becomes inert. The gateway's write credential is scoped to
`gnh-*` prefix server-side; devices get read-only per-exact-topic credentials.

### D4: In-app SSE, not UnifiedPush distributor

UnifiedPush requires the user to install a separate distributor app. SSE is self-contained.
Downside: F-Droid process killed by Doze → stream gone. Mitigation: existing WorkManager
30s chain catches missed wakes. Wake is a hint, not the message.

### D5: APNs adapter stays, FCM adapter deleted

APNs is the only supported iOS background-wake path. FCM is Google; removed entirely.
`poke-gateway/src/fcm.ts` and `google-auth-library` are deleted.

## Risks / Trade-offs

- **[Risk] F-Droid app killed by Doze** → wake is missed. Mitigation: WorkManager one-shot
  chain (30s) is the recovery path. Chat correctness does not depend on wake delivery.
- **[Risk] ntfy server outage blocks F-Droid wakes** → same as gateway outage for iOS.
  Mitigation: WorkManager / BGAppRefresh remains; chat is eventually consistent.
- **[Risk] ntfy message `id` replay on reconnect** → dedup window in native module prevents
  duplicate sync calls. Short in-memory Set of recent seen ids is sufficient.
- **[Risk] APNs silent push throttled by iOS** → already acknowledged in existing spec.
  Poke is a hint. App reconciles on next BGAppRefresh or foreground open.
- **[Risk] ntfy `gnh-*` publish credential leaked** → allows wake spam. Mitigation: rate
  limit at gateway (1 poke / 5 min / pokeId); ntfy server `auth-default-access: deny-all`.

## Migration Plan

1. Revert `build-signed-apk.yml` and docs to pre-GMS-matrix state (targeted `git checkout`).
2. Delete FCM code from `poke-gateway/` and client.
3. Add ntfy fallback POST in gateway `routes.ts`.
4. Add `GnhNtfyWake` Android native module (SSE client → WorkManager).
5. Wire JS topic-list bridge: JS pushes own-topic list to native on room create/accept/destroy.
6. Update `docs/features/peer-wake-notification.md` Phase 3 section.
7. Update `poke-gateway/.env.example` with `NTFY_BASE_URL` and `NTFY_PUBLISH_TOKEN`.

Rollback: gateway ntfy fallback is additive — removing it restores the pre-change behaviour
with no wake for F-Droid peers (same as today).

## Open Questions

None — all decisions are made and locked.
