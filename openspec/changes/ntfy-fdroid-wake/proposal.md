## Why

F-Droid / GrapheneOS users have no FCM. iOS users are subject to ~15-minute BGAppRefresh gaps
when suspended. After an L2 Hyperswarm session drops and Alice sends an L1′ relay message, Bob's
phone may not see it for minutes. A lightweight peer-wake layer cuts that gap to seconds without
Google or persistent sockets.

## What Changes

- **Remove** FCM / GMS entirely: `poke-gateway/src/fcm.ts`, `google-auth-library` dependency,
  all `"fcm"` platform references across client and native code, GMS APK CI matrix,
  `GOOGLE_SERVICES_JSON_BASE64` secret docs.
- **Add** ntfy fallback in the poke-gateway: when a `pokeId` is not found in the APNs registry
  (F-Droid peer), gateway POSTs `wake` to `https://ntfy.getnowhere.im/gnh-<pokeId>`.
- **Add** in-app ntfy SSE subscriber in the Android native module: `GET /gnh-<ownPokeId>/json`,
  reconnect with backoff, on `message`+`wake` → `scheduleSoonRemoteNodeSync`.
- **Add** ntfy read-only topic credential exchange: F-Droid client gets a per-topic read
  credential from the server at subscribe time; gateway holds a write-only credential.
- **Revert** `build-signed-apk.yml` to F-Droid-only (pre-matrix). `v*-f-droid` → APK only;
  other `v*` → Electron desktop only (already correct in `release-electron-sidecar.yml`).
- **Update** `docs/features/peer-wake-notification.md`: Phase 3 is this design (no longer
  deferred). Remove FCM from platform matrix. Add ntfy subscribe path.
- **Update** `poke-gateway` to strip FCM, add ntfy fallback POST.

## Capabilities

### New Capabilities

- `peer-wake/ntfy-fdroid-wake`: Room-scoped `pokeId` → ntfy topic wake for F-Droid/GrapheneOS
  Android. Gateway falls back to ntfy when pokeId has no APNs registration. F-Droid native
  module subscribes to own topic and triggers existing WorkManager sync on wake receipt.

### Modified Capabilities

- `p2p-chat-connectivity`: `sendPoke` no longer calls a gateway for F-Droid peers; gateway
  handles routing internally. Poke trigger rule unchanged (first L1′ after L2 drop, 5-min
  cooldown). pokeId forget on room destroy unchanged.

## Impact

- `poke-gateway/`: strip FCM, add ntfy fallback POST, keep APNs adapter.
- `src/services/poke/pokeGatewayClient.ts`: remove `"fcm"` platform type; gateway call
  interface unchanged (POST `/poke { to }`).
- `native-wrapper/src/gnhPokeNative.ts`: remove FCM token path; keep APNs path.
- `native-wrapper/android-native/`: new `GnhNtfyWake` module — ntfy SSE client,
  WorkManager trigger on wake.
- `src/vite-env.d.ts`, `src/lib/mobile/pushTokenBridge.ts`: remove `"fcm"` union type.
- `.github/workflows/build-signed-apk.yml`: revert to F-Droid-only single-job workflow.
- `docs/builds/expo-eas-android-build.md`: revert GMS docs; describe F-Droid-only CI.
- `docs/features/peer-wake-notification.md`: promote Phase 3 from deferred to current design.
