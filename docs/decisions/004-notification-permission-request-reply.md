# 004 — Notification permission as request/reply

Status: **Proposed**  
Date: 2026-11-23  
Source: `openspec/changes/ios-notification-permission-chain`

## Context

Settings sent `requestPermissions` over `gnh-notifications` without waiting for
an answer. The shell dropped the call when `GnhNotifications` was missing,
swallowed errors, and threw the result away. The Wake toggle fetched the APNs
token in parallel, before the user had answered. Android resolved `"requested"`
before the user answered. On iOS the app never appeared under Settings → Apps →
Get NowHere → Notifications, and nothing in the UI said why.

## Decision

1. Permission is a request/reply over `gnh-notifications`: `requestPermissions`
   and `getPermissionStatus` carry a `requestId`; the shell answers once through
   `window.gnhMobile._resolveNotifications` with `status`, `alertEnabled`, and an
   optional `apnsToken`. Missing module or failed call → `unavailable`.
2. The native shell owns ordering: permission answer → (iOS, when asked) APNs
   token → reply. Android asks `POST_NOTIFICATIONS` first and calls the Kotlin
   module only after a grant.
3. A toggle turns on only after the needed permission is granted (and, for iOS
   Wake contact, after the gateway accepted the registration). Otherwise it stays
   off with one message under it. A 10-minute safety timer ends a request that
   never answers, with no message.
4. Settings reconciles stored toggles with the OS state on open, only turning
   toggles off, never prompting.

## Consequences

- Every failure is visible on the toggle the user touched; "not available in
  this build" points at native module loading.
- The old fire-and-forget command and the web-side token refresh call are gone;
  token rotation stays in `pushTokenBridge`.
- No wire, `ph`, or poke-gateway API change.
- If iOS still shows no prompt on a real build, the fallback is to let
  expo-notifications own iOS permission (Option A in the change proposal).

@see `docs/features/local-background-notifications.md` (Settings and permissions)
