## 1. CI revert — restore F-Droid-only APK workflow

- [x] 1.1 Restore `build-signed-apk.yml` to pre-matrix state — done in commit `d0c344e`
- [x] 1.2 Verify trigger logic: `v*-f-droid` → APK only; other `v*` → Electron only — confirmed intact

## 2. Delete FCM / GMS dead code

- [x] 2.1 Delete `poke-gateway/src/fcm.ts`
- [x] 2.2 Remove `google-auth-library` from `poke-gateway/package.json` and run `npm install` in `poke-gateway/`
- [x] 2.3 Remove FCM import and routing branch from `poke-gateway/src/routes.ts`
- [x] 2.4 Remove `"fcm"` from `Platform` type in `poke-gateway/src/db.ts`
- [x] 2.5 Remove `"fcm"` union from `src/vite-env.d.ts` (`onPokeToken`, `_dispatchPokeToken`)
- [x] 2.6 Remove `"fcm"` from `src/services/poke/pokeGatewayClient.ts` (`registerPokeHandle` platform param)
- [x] 2.7 Remove `"fcm"` path from `native-wrapper/src/gnhPokeNative.ts`
- [x] 2.8 Remove `"fcm"` from `src/lib/mobile/pushTokenBridge.ts` and `src/hooks/usePushTokenBridge.ts`
- [x] 2.9 Remove `"fcm"` from `native-wrapper/src/injectMobileBridge.ts`
- [x] 2.10 Update tests in `tests/native-wrapper/inject-mobile-bridge.test.ts` — replace `"fcm"` assertions with `"apns"` (only `"apns"` platform remains)

## 3. Gateway ntfy fallback

- [x] 3.1 Add `NTFY_BASE_URL` and `NTFY_PUBLISH_TOKEN` to `poke-gateway/.env.example`
- [x] 3.2 Add ntfy fallback POST in `poke-gateway/src/routes.ts`: on DB miss for `/poke`, POST `wake` to `${NTFY_BASE_URL}/gnh-<partnerPokeId>` with `Authorization: Bearer ${NTFY_PUBLISH_TOKEN}`
- [x] 3.3 Add SSRF guard: validate `to` against `/^[A-Za-z0-9_-]{14}$/` before any lookup or ntfy call; return 400 on mismatch
- [x] 3.4 Gateway always returns `202 Accepted` regardless of APNs or ntfy path
- [x] 3.5 Add unit tests in `poke-gateway/` covering: ntfy fallback POST on DB miss, SSRF guard rejects bad `to`, APNs path unaffected when pokeId found

## 4. F-Droid local pokeId mint

- [x] 4.1 Add `generatePokeId(): string` to `src/lib/crypto/pokeId.ts` — `crypto.getRandomValues(10 bytes)` → base64url no-padding (14 chars)
- [x] 4.2 Add unit tests: output is 14 chars, matches `/^[A-Za-z0-9_-]{14}$/`, two calls return different values
- [x] 4.3 Store own `pokeId` in `roomCatalogStore` alongside existing `partnerPokeHandle` — field name `ownPokeId`
- [x] 4.4 Pass own `pokeId` into `encodeCreateSmartBody` / `encodeRegisterSmartBody` via existing `pokeHandle` argument (no wire format change)
- [x] 4.5 Clear `ownPokeId` and `partnerPokeHandle` on room destroy (leave, room_revoked, roomTtl, invite expiry) — extend existing cleanup in `roomCatalogStore` / `contactsStore`

## 5. Android ntfy SSE native module

- [x] 5.1 Create `native-wrapper/android-native/GnhNtfyWake/GnhNtfyWakeModule.kt` — OkHttp SSE client to `${NTFY_BASE_URL}/gnh-<ownPokeId>/json`, bearer token auth, reconnect with exponential backoff
- [x] 5.2 On `event=message` + body `wake` (or empty): dedup by ntfy message `id` (in-memory LRU, last 50 ids), call `RemoteNodeBackgroundSyncScheduler.scheduleSoonRemoteNodeSync`, do NOT show notification
- [x] 5.3 Expose `subscribe(topic: String, token: String)` and `unsubscribe()` JS bridge methods
- [x] 5.4 Create `GnhNtfyWakePackage.kt` and register in `MainApplication`
- [x] 5.5 Add `OkHttp` / `okhttp-sse` dependency to `native-wrapper/android/app/build.gradle` (Expo plugin or direct)
- [x] 5.6 Add unit tests: `GnhNtfyWakeModuleTest` — wake received → sync scheduled once; duplicate id → sync called once; keepalive ignored

## 6. JS ntfy topic bridge + settings toggle wiring

- [x] 6.1 Add `src/lib/mobile/ntfyWakeBridge.ts` — exposes `subscribeRoom(roomId, topic, token)`, `unsubscribeRoom(roomId)`, `unsubscribeAll()` via native `GnhNtfyWakeModule`
- [x] 6.2 On room create/accept (and `pushWakeEnabled === true`): derive own topic `gnh-<ownPokeId>`, call `subscribeRoom`
- [x] 6.3 On room destroy: call `unsubscribeRoom` for that room regardless of `pushWakeEnabled`
- [x] 6.4 Configure per-topic ntfy read credential via `VITE_NTFY_BASE_URL` + static or per-topic token — scope: read-only exact topic
- [x] 6.5 Update `src/services/poke/applyPushWakeSetting.ts` — on `on=true`: F-Droid calls `ntfyWakeBridge.subscribeAll()` (re-subscribe active rooms); iOS keeps `bridgeRequestPokeTokenRefresh`
- [x] 6.6 Update `src/state/settingsStore.ts` opt-out path — `pushWakeEnabled` transitions to false: call `ntfyWakeBridge.unsubscribeAll()` alongside existing `deletePokeHandle()`
- [x] 6.7 Update Settings toggle copy in `SettingsScreen.tsx` (~line 239): `"Uses Apple/Google push."` → `"Uses ntfy / APNs wake. No Google."`

## 7. Docs update

- [x] 7.1 Update `docs/features/peer-wake-notification.md` §12 — promote Phase 3 from deferred to current design; document ntfy path, pokeId-as-capability, gateway fallback, forget-on-destroy
- [x] 7.2 Update platform matrix table (§5): replace FCM row with ntfy row; add iOS ntfy note (foreground only; APNs for background)
- [x] 7.3 Update `docs/security/p2pchatprotocol.md` — note that `ph` field is now used for ntfy topic as well as APNs gateway handle

## 8. Tests (aligned to toggle + architecture)

- [x] 8.1 `tests/native-wrapper/inject-mobile-bridge.test.ts` — already updated in task 2.10; verify no `"fcm"` references remain after deletion
- [x] 8.2 `tests/services/poke/apply-push-wake-setting.test.ts` — update existing opt-in test: F-Droid variant calls `ntfyWakeBridge.subscribeAll` instead of `bridgeRequestPokeTokenRefresh`; iOS variant still calls `bridgeRequestPokeTokenRefresh`; opt-out still does NOT call either
- [x] 8.3 `tests/state/settings-store-push-wake.test.ts` — add: when `pushWakeEnabled` turns off, `ntfyWakeBridge.unsubscribeAll` is called alongside `deletePokeHandle`; when `notificationsEnabled` turns off (cascades `pushWakeEnabled=false`), `unsubscribeAll` is also called
- [x] 8.4 `tests/protocol/poke-ph-wire.test.ts` — confirm existing tests pass; add: invalid `ph` (wrong length, non-base64url) → `undefined`, no throw; `generatePokeId()` output round-trips correctly through encode/parse
- [x] 8.5 `tests/p2p/poke-trigger.test.ts` — confirm existing trigger tests pass; add: room destroy clears `ownPokeId` and calls `unsubscribeRoom`; `pushWakeEnabled=false` skips both `sendPoke` and `subscribeRoom` on room create
- [x] 8.6 `tests/android-native/GnhNtfyWakeModuleTest` — wake received → `scheduleSoonRemoteNodeSync` called once; duplicate ntfy message `id` → called once; `keepalive` / `open` events → not called; `unsubscribeAll` closes SSE connection
- [x] 8.7 Integration: mock ntfy SSE fixture — `message`/`wake` → sync scheduled once; duplicate id → once; reconnect after server drop → resubscribes and processes next wake
