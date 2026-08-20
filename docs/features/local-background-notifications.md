# Local background notifications (`native-wrapper` only)

Privacy-controlled **local** notifications for L1 / L1′ events received by the
background node-sync while the app is backgrounded and L2 Holepunch rooms are
likely unmounted. No push services, no server, no remote notification SDK.

## Event flow

```
BG refresh (WorkManager / BGAppRefreshTask)
  → WebView JS: runBackgroundRemoteSync()
      → sync() (remote-node wallet sync, ChaCha20-Poly1305 decrypt + validate)
      → refreshInvites() / refreshRelays() (parse, dedupe, persist)
      → scanAndPublishSyncNotifications()
          → publishDomainNotificationEvent()
              → opaque eventId = sha256(domain event id)
              → persistent ledger insert (dedup + unread count)
              → postMessage("gnh-notifications") → RN shell
                  → GnhNotifications native module (Kotlin / Swift)
```

Foreground path: `useWalletLiveSync` runs the same scan only while the
tab/app is hidden. The active-foreground app never posts banners — in-app
`NotifyPin` badges render the event directly.

Notification creation happens **after** authenticated decryption, protocol
validation, replay/dedup checks, and persistence. Never from raw tx data.

## Layers

| Layer | Files |
|-------|-------|
| Contract types | `src/services/notifications/nativeNotificationTypes.ts` |
| Normalization | `src/services/notifications/toNativeNotificationEvent.ts`, `graphemeTruncate.ts` |
| Ledger (dedup + unread) | `src/services/notifications/notificationEventLedger.ts` |
| Publish orchestration | `src/services/notifications/publishBackgroundNotification.ts`, `scanSyncNotifications.ts` |
| WebView → RN bridge | `src/lib/mobile/nativeNotificationsBridge.ts` (channel `gnh-notifications`) |
| RN shell routing | `native-wrapper/src/handleNotificationsWebViewMessage.ts`, `gnhNotificationsNative.ts` |
| Android (Kotlin) | `native-wrapper/android-native/GnhNotifications/` |
| iOS (Swift) | `native-wrapper/ios-native/GnhNotifications/` |
| Expo plugin | `native-wrapper/plugins/withGnhNotifications.js` |

## Content rules (L1 vs L1′)

| Event | Title | Body |
|-------|-------|------|
| L1 invitation received | `Room invitation received` | same |
| L1 invitation accepted (register seen) | `Room invitation accepted` | same |
| L1′ known-room message | contact alias | `<contact>: <preview>` |

- Preview built only from authenticated decrypted plaintext; control chars
  stripped, whitespace collapsed, truncated at a grapheme boundary
  (`SINGLE_LINE_PREVIEW_GRAPHEMES = 72`).
- Unknown contact or blank-after-normalization message → `New message`.
- Never in title/body/userInfo/extras: wallet addresses, room IDs, Holepunch
  keys, tx hashes, raw payloads, decrypt errors. The only native payload id is
  an opaque sha256 of the domain event id.

## Settings and permissions

Settings → Privacy adds two persisted switches (defaults **off**):

- **Notifications** (`privacy.notificationsEnabled`) — badge/unread tracking.
- **Notification banner** (`privacy.notificationBannersEnabled`) — system
  banner. Store invariant (enforced in `setPrivacy`, not just UI): turning
  Notifications off forces banners off. The banner row is disabled with
  “Enable notifications to configure banners.” while Notifications is off.

| Notifications | Banners | Badge | Banner |
|---|---|---|---|
| Off | forced off | no change | no |
| On | off | increment | no |
| On | on | increment | yes, subject to OS permission + background state |

Permission requests happen only from the Settings toggle gesture:

- Android 13+: `POST_NOTIFICATIONS` runtime request (declared in `app.json`).
  Background tasks never prompt; posting without grant is a safe no-op.
- iOS: `.badge` requested when Notifications turns on; `.alert`+`.sound` only
  when banners turn on. After `denied`, the app never re-prompts (route users
  to OS settings). Banner delivery requires `authorized`/`provisional`.

## Badge semantics and deduplication

- Unread count lives in the TS ledger (`gnh.notificationEvents.v1`), keyed by
  opaque eventId with read/unread state. One increment per unique event;
  blockchain rescans/replays hit the ledger and are dropped before any native
  call.
- Native layers keep their own delivered-id ledger (SharedPreferences /
  UserDefaults, opaque ids only, capped at 512) so a banner is never re-posted
  even across process restarts.
- Badge clears via existing read semantics: `markRoomSeen` (room opened) and
  `markContactSeen` (contact detail opened) mark matching ledger events read
  and re-sync the native badge; delivery alone never clears it.

## Platform limitations

- **Android**: there is no public app-badge API without a notification;
  launcher badge behavior is OEM-dependent. With banners off we keep the
  internal ledger correct and set `setNumber` on the channel when banners are
  on, but we deliberately do not post silent notifications just to force a
  badge. Channel: `nowhere_messages` / “Messages”, badges enabled,
  `IMPORTANCE_DEFAULT` (verified working: badge + notification-center entry).
- **Channel importance is immutable after first creation.** Changing the
  constant in code does **not** update a channel that already exists on a
  device; it needs a reinstall or a new channel ID. Note that reinstalling also
  clears `gnh.settings`, resetting `notificationsEnabled` to `false` — re-enable
  it in Settings → Privacy before retesting.
- Heads-up (on-screen floating) banners would require `IMPORTANCE_HIGH`. Not
  adopted: `IMPORTANCE_DEFAULT` is the configuration verified end-to-end on
  device, and the change was reverted rather than shipped unverified.
- **iOS**: badge set via `UNUserNotificationCenter.setBadgeCount` (iOS 16+)
  with `applicationIconBadgeNumber` fallback. Foreground presentations show
  badge only (`willPresent → [.badge]`). Lock-screen preview visibility is
  governed by the user's OS notification-preview settings; we do not bypass.
- Background execution is best-effort (see `docs/background-remote-sync.md`);
  missed windows catch up on next foreground sync without duplicate banners.
  Scan/publish uses native AppState (`background` / `screenOff`) as the live
  background signal. Android WebView often leaves `document.visibilityState`
  as `visible` after Home; `getAppAccessState().reason === "background"` is a
  lock reason set on *return*, not a live background flag. Do not use either
  as the sole gate.
- Android WebView `pauseTimers()` stops the JS 30s poll after Home. While
  backgrounded, the shell starts a 0-delay one-shot WorkManager worker that
  keeps polling every 30s in-process (Doze batches *delayed* work to ~15 min).
  Foreground clears the chain flag so the loop exits.

## Tap handling

- Android: content intent carries only `gnhNotificationEventId` extra and
  opens the launcher activity; the app resolves the event locally after
  unlock.
- iOS: `userInfo` carries only the opaque eventId; the delegate forwards it as
  a `gnhNotificationTap` RN event.

## What this feature does not do

- No wire-format, invitation-semantics, or crypto changes.
- No L2 Holepunch mounting requirement — designed for L2-down delivery.
- No previews/plaintext in logs, prefs, UserDefaults, intents, or URLs.
