# Proposal

## Why

On iOS the app never shows up under Settings → Apps → Get NowHere → Notifications,
so it never got notification permission. Without permission there is no APNs
token, no gateway registration, no poke handle in invites, and peers cannot
wake the device. Every hop of the permission chain fails silently today, so
neither users nor developers can tell where it breaks.

## What Changes

- Permission requests on the `gnh-notifications` bridge become request/reply:
  the native shell answers with the OS permission status, whether alerts are
  enabled, and (iOS, when asked) the APNs device token. A missing native module
  answers `unavailable` instead of doing nothing.
- The native shell orders the iOS steps: wait for the user's answer to the
  system prompt, then fetch the APNs token only if permission was granted. On
  Android the shell waits for the real `POST_NOTIFICATIONS` answer.
- Settings toggles (Notifications, Wake contact, Notification banner) turn on
  only after the OS grants what that toggle needs. Otherwise they stay off and
  show a short message directly under the toggle; the message clears when the
  user leaves Settings.
- Wake contact on iOS also reverts when gateway registration fails.
- When Settings opens, toggles stored on without the matching OS permission are
  switched off silently, so the next tap prompts again.
- The notification-center delegate is installed at app launch.
- Docs: notification feature docs, an ADR for the request/reply decision, and an
  operator note on the 2026-11-18 Docker upgrade outage of ntfy and the poke
  gateway.
- Close stale findings F1/F2 (already fixed and covered by tests).

## Capabilities

### New Capabilities

- `notification-permission`: how the mobile app asks for notification
  permission, reports the outcome in Settings, and registers for peer wake.

### Modified Capabilities

(none)

## Impact

- `src/`: Settings screen, notifications bridge, push-wake setting flow,
  `vite-env.d.ts` bridge typing.
- `native-wrapper/`: `App.tsx` message routing and launch subscription,
  notifications message handler, native wrapper module, injected bridge,
  Android permission request via the shell.
- Native Swift/Kotlin modules: reply payload gains `alertEnabled`; no new
  native permissions or entitlements.
- No wire-format, protocol, crypto, or poke-gateway API changes.
- Requires one `adhoc-ios` EAS build plus a two-user device test.
- Docs: `docs/features/local-background-notifications.md`,
  `docs/features/peer-wake-notification.md`, `poke-gateway/README.md`,
  new `docs/decisions/004-notification-permission-request-reply.md`, `docs/README.md`.

## Decision record

This change is recorded as ADR 004 (docs/decisions/004-notification-permission-request-reply.md).
