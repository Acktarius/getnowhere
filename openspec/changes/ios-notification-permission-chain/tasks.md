# Tasks

## 1. WebView bridge contract

- [x] 1.1 Add `_resolveNotifications(reply)` and reply handler registry to the injected `window.gnhMobile` (`native-wrapper/src/injectMobileBridge.ts`), plus `buildNotificationsResolveScript(reply)`; type it in `src/vite-env.d.ts`. Verify with new cases in `tests/native-wrapper/inject-mobile-bridge.test.ts` (dispatch reaches handler, unsubscribe stops delivery, script evals).
- [x] 1.2 Add `requestNotificationPermission({ badge, alert, wantToken })` and `getNotificationPermissionStatus()` Promises with `requestId` to `src/lib/mobile/nativeNotificationsBridge.ts`: non-mobile host → `unavailable`; 10-minute safety timer → `unavailable` + `timedOut`; reply routed by `requestId`; late reply delivered to a still-registered listener. Verify with `tests/lib/mobile/native-notifications-bridge.test.ts` (fake timers).

## 2. Native shell ordering

- [x] 2.1 `handleNotificationsWebViewMessage` handles `requestPermissions` / `getPermissionStatus` with a reply callback; module missing or thrown call → `unavailable`; reply carries `status`, `alertEnabled`, optional `apnsToken`. Verify with `tests/native-wrapper/handle-notifications-webview.test.ts`.
- [x] 2.2 iOS ordering in `native-wrapper/src/gnhNotificationsNative.ts`: await Swift `requestPermissions`, read `alertEnabled` via `getPermissionStatus`, fetch `getDevicePushTokenAsync` only when `wantToken` and status is authorized/provisional; token error → no `apnsToken`. Verify with tests asserting the token call never happens before or without a granted status.
- [x] 2.3 Android path: on API ≥ 33 `PermissionsAndroid.request(POST_NOTIFICATIONS)` first, then Kotlin `requestPermissions` (channel) only after `granted`; `granted` → authorized, `denied`/`never_ask_again` → denied; API < 33 → Kotlin `requestPermissions`, authorized; `alertEnabled` from Kotlin `getPermissionStatus`. Verify with tests using the `tests/native-wrapper/stubs` react-native stub.
- [x] 2.4 `native-wrapper/App.tsx`: pass a reply injector to the notifications handler (`buildNotificationsResolveScript`), and subscribe to `gnhNotificationTap` via `NativeEventEmitter` at mount on iOS (extract `installNotificationTapListener` helper). Verify with a helper unit test (subscribes once, cleanup removes) and `npm run types`.

## 3. Settings toggles

- [x] 3.1 Pure toggle flow in `src/services/notifications/notificationToggleFlow.ts`: `grantedFor(toggle, reply)` and `runToggleOn(toggle)` returning `{ on: true } | { on: false, message?: string }`, covering authorized, provisional (badge ok, wake/banner fail), alert off, denied, unavailable, timed out (no message), Wake iOS `registerPokeHandle` failure or missing token, Wake Android `subscribeAll`. Verify with `tests/services/notifications/notification-toggle-flow.test.ts` including provisional → authorized re-tap.
- [x] 3.2 Wire `SettingsScreen.tsx`: pending toggle disabled and shown off; on success `setPrivacy`; failure message rendered directly under that toggle from component state; message cleared on unmount and on later success. `applyPushWakeEnabled` becomes the async Wake flow (opt-out branch unchanged). Verify with `tests/screens/SettingsScreen.notification-permission.test.tsx` and updated `tests/screens/SettingsScreen.push-wake.test.tsx`, `tests/services/poke/apply-push-wake-setting.test.ts`.
- [x] 3.3 Mount reconciliation in Settings (mobile host only): `getNotificationPermissionStatus` once; stored-on toggles not granted → off, no message; `unavailable` → no change; stored-off stays off. Verify with tests for `notDetermined`, alert-off (Wake/Banner off, Notifications on), authorized + stored off, unavailable.

## 4. Docs, ADR, operator note

- [x] 4.1 Update `docs/features/local-background-notifications.md` (Settings and permissions: request/reply, toggle revert + exact messages, mount reconciliation, delegate at launch) and `docs/features/peer-wake-notification.md` (permission → token → register ordering). Verify docs match the spec scenarios by review.
- [x] 4.2 Write `docs/decisions/004-notification-permission-request-reply.md` (Status: Proposed) in the existing `docs/decisions/` format and link it from the `docs/README.md` reading order next to the notification docs. Verify the file exists and the index links to it.
- [x] 4.3 Add an operator section to `poke-gateway/README.md`: Docker/containerd upgrade can leave `unless-stopped` containers down; systemd `ExecStartPost` start guard; unattended-upgrades blacklist; health checks for ntfy and gateway. Verify `.repo-kit/scripts/scrub-personal-data.sh poke-gateway docs` reports no hits.

## 5. Findings, product loop, checks

- [x] 5.1 Run `npx vitest run tests/p2p/poke-invite-accepted.test.ts tests/p2p/room-catalog.test.ts`; on green, resolve findings F1 and F2 with `forge finding resolve`. Verify `forge finding list` no longer lists them.
- [x] 5.2 Product-loop e2e: `e2e/notification-permission.spec.ts` on the Vite preview harness with a stubbed `window.ReactNativeWebView` / `window.gnhMobile` answering `gnh-notifications` commands — denied → toggle off + guidance message; authorized → toggle on; message gone after navigating away. Verify `forge e2e run` is green.
- [x] 5.3 Run `npm run lint`, `npm run format:fix`, `npm run check`, `npm run types`, `npm test`, and `cd native-wrapper && npx tsc --noEmit`; all pass.

## 6. Device gate (operator)

- [ ] 6.1 Operator runs `npm run mobile:sync-ui` and one `adhoc-ios` EAS build; installs on two registered iPhones. Verify: tapping Notifications shows the system prompt and the app appears under Settings → Apps → Get NowHere → Notifications.
- [ ] 6.2 Two-user wake test on that same build: both enable Wake contact, create and accept a room, drop L2, send an L1′ message; the receiver gets the wake banner. Record the result in the session; failure → Option A decision per proposal.
