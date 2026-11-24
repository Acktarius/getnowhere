# Design

## Context

See proposal.md — Why. Current chain: Settings toggle → `bridgeRequestNotificationPermissions`
(fire-and-forget `postMessage`) → `handleNotificationsWebViewMessage` →
`nativeRequestPermissions` (returns early when `NativeModules.GnhNotifications` is
missing, swallows errors, drops the result). Token refresh runs in parallel and
checks permission before the user answers. Android `requestPermissions` resolves
`"requested"` before the user answers. `GnhNotificationCenterDelegate` installs
only when JS listens to `gnhNotificationTap`, which nothing does.

Same `RCT_EXTERN_MODULE` Swift pattern works on iOS for GnhSecurity (Face ID),
so the module pattern itself is not the suspect.

## Goals / Non-Goals

**Goals:**

- One request/reply contract for permission on both platforms.
- Visible outcome for every failure mode, on the toggle the user touched.
- Correct iOS ordering: permission answer → token → gateway registration.

**Non-Goals:**

- Moving iOS notifications to expo-notifications (Option A; fallback only).
- Routing notification taps into rooms.
- Any protocol, `ph` wire, or poke-gateway API change.

## Decisions

### D1. Request/reply over `gnh-notifications` with `requestId`

Commands `requestPermissions { requestId, badge, alert, wantToken }` and
`getPermissionStatus { requestId }`. The shell replies with an injected
`window.gnhMobile._resolveNotifications(reply)`:

```
{ requestId, status: "authorized"|"provisional"|"denied"|"notDetermined"|"unavailable",
  alertEnabled: boolean, apnsToken?: string }
```

Same shape as the `_resolveSaveTextFile` / `_resolveSecurity` patterns already in
the injected bridge. Alternative: keep fire-and-forget and poll status from the
UI — rejected, it reintroduces the race and cannot tell "missing module" apart.

The UI wrapper returns a Promise per `requestId`; non-mobile host resolves
`unavailable`; a 10-minute safety timer resolves `unavailable` with a
`timedOut` flag so Settings shows no message. A late reply after the timer is
still applied while Settings is mounted (handler kept until unmount).

### D2. Native shell owns ordering

- iOS: `await GnhNotifications.requestPermissions(badge, alert)` → parse
  status; read `alertEnabled` from `getPermissionStatus`. If `wantToken` and
  status is authorized/provisional → `getDevicePushTokenAsync()`
  (expo-notifications, unchanged token source). Token errors leave `apnsToken`
  undefined; the UI treats a missing token on Wake as a registration failure.
- Android: on API ≥ 33, `PermissionsAndroid.request(POST_NOTIFICATIONS)` first
  — it resolves with the user's actual answer; `never_ask_again` → `denied`.
  Only after `granted`, call Kotlin `requestPermissions` (no prompt then; it
  ensures the channel). Kotlin first would open its own dialog, and Android
  answers a concurrent second request immediately with empty results, which RN
  maps to `denied` while the dialog is still on screen. API < 33 → Kotlin
  `requestPermissions`, `authorized`. `alertEnabled` from Kotlin
  `getPermissionStatus` (`areNotificationsEnabled`).
- Module missing or a call throws → `unavailable`.

Alternative for Android: forward `onRequestPermissionsResult` from
MainActivity into the Kotlin module — rejected, more native plumbing for the
same answer RN already exposes.

### D3. Swift `getPermissionStatus` already returns alert/badge

Reused as is. `requestPermissions` keeps its "never re-prompt after denied"
guard; the shell maps its result. No Swift logic change beyond what the shell
reads, so Swift unit tests stay valid.

### D4. Settings flow per toggle

`grantedFor(toggle, reply)`:
- Notifications: status ∈ {authorized, provisional}
- Wake contact, Notification banner: status = authorized ∧ alertEnabled

Tap on → mark toggle pending (disabled, shown off) → request → granted? →
(Wake iOS: `registerPokeHandle(apnsToken)`; Wake Android: `subscribeAll()`) →
`setPrivacy({...: true})`. Any failure → keep off, set that toggle's message.
Messages live in SettingsScreen component state, keyed by toggle, so they
clear on unmount. The current `applyPushWakeEnabled` becomes the async flow
used by the Wake toggle; its opt-out branch is unchanged.

### D5. Mount reconciliation

On mount (mobile host only) → `getPermissionStatus` → for each toggle stored on
with `!grantedFor(toggle, reply)` → `setPrivacy({...: false})`, no message.
`setPrivacy` already forces Wake + Banner off when Notifications goes off.
`unavailable` at mount changes nothing (avoid wiping settings on a transient
bridge miss).

### D6. Delegate at launch

`App.tsx` subscribes to `gnhNotificationTap` through `NativeEventEmitter` on
iOS at mount; the subscription triggers `startObserving` → delegate install.
Tap payload ignored for now.

## Risks / Trade-offs

- [The real iOS root cause is still unknown] → the reply makes it visible:
  "not available in this build" points at module loading; a prompt that
  appears and works means the bug was the toggle-only trigger or the race.
  Fallback to Option A per proposal if the two-user ad-hoc test fails.
- [Overriding expo-notifications' delegate] → we do not use expo listeners;
  token APIs do not depend on the delegate.
- [Mount reconciliation turns settings off after an OS-level change] → by
  design; next tap restores with a prompt or a message.
- [Safety timer hides a hung native call] → acceptable; reconciliation shows
  real state on next Settings visit.

## Migration Plan

No data migration. Ship in one `adhoc-ios` build; two-user wake test on that
build; `preview-ios` only after it passes. Rollback = previous build.
