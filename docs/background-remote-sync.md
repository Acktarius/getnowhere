# Background remote-node sync

Best-effort background refresh asks the OS for occasional execution time, then
calls the same **remote-node wallet sync** path used in the foreground
(`sync()` in `src/services/conceal/sync/runtime.ts` via the mobile WebView
bridge). The remote node maintains blockchain checkpoints; this hook does not
add local validation, block processing, or a new sync engine.

## Semantics

| Platform | Request | Actual cadence |
|----------|---------|----------------|
| Android | WorkManager `PeriodicWorkRequest` (15-minute floor) plus a 0-delay one-shot that polls every 30s while backgrounded (`remote-node-background-sync-soon`) | Doze may still stop a long-running worker; a new one-shot is enqueued if the app is still backgrounded |
| iOS | `BGAppRefreshTask`, `earliestBeginDate = now + 15 min` | iOS chooses when (not guaranteed every 15 min) |

Background refresh is **not guaranteed** and is **not** a substitute for
foreground sync. If the user force-quits, disables background refresh, has no
network, or the OS skips the task, the wallet catches up on the next foreground
launch.

## Integration points

| Layer | Location |
|-------|----------|
| Android entry | `MainApplication.onCreate` → `RemoteNodeBackgroundSyncScheduler.scheduleRemoteNodeBackgroundSync` |
| iOS entry | `AppDelegate` → `RemoteNodeBackgroundRefreshScheduler.registerBackgroundTasks` + `scheduleNextRefresh` |
| Sync API | `sync()` / `syncRuntime()` in `src/services/conceal/sync/runtime.ts` |
| WebView hook | `src/lib/mobile/backgroundRemoteSync.ts` → `window.gnhMobile._runBackgroundRemoteSync` |
| Native sources | `native-wrapper/android-native/GnhBackgroundSync/`, `native-wrapper/ios-native/GnhBackgroundSync/` |
| Expo plugin | `native-wrapper/plugins/withGnhBackgroundSync.js` |

Committed Kotlin/Swift live under `android-native/` and `ios-native/`; run
`expo prebuild` to copy them into the generated `android/` / `ios/` trees.

## Manual configuration

### Android

1. After editing native sources, run:
   ```bash
   cd native-wrapper && npx expo prebuild --platform android
   ```
2. WorkManager dependency and worker scheduling are applied by
   `withGnhBackgroundSync.js`.
3. Network constraint: `NetworkType.CONNECTED` (no sync without connectivity).
4. Unique work name: `remote-node-background-sync` (`ExistingPeriodicWorkPolicy.KEEP`).

### iOS

1. After editing native sources, run:
   ```bash
   cd native-wrapper && npx expo prebuild --platform ios
   ```
2. `Info.plist` must include:
   - `BGTaskSchedulerPermittedIdentifiers`: `org.getnowhere.remote-node-refresh`
   - `UIBackgroundModes`: `fetch`
3. Background App Refresh must be enabled for the app in iOS Settings.
4. JS resolve and the 20s timeout complete **at most once**. The waiter is removed under an `NSLock`; the callback runs after unlock. Do not `DispatchQueue.sync` from the timeout block — that SIGTRAPped in TestFlight (`__DISPATCH_WAIT_FOR_QUEUE__`).
5. Task identifier constant: `RemoteNodeBackgroundSyncConfig.taskIdentifier`.

## Testing (debug builds)

### Android WorkManager

```bash
cd native-wrapper/android
./gradlew :app:testDebugUnitTest --tests 'im.getnowhere.app.backgroundsync.*'
```

Manual worker run (device/emulator with debug build):

```bash
adb shell am broadcast -a androidx.work.diagnostics.REQUEST_DIAGNOSTICS \
  -p im.getnowhere.app
```

Or use Android Studio **App Inspection → Background Task Inspector** to observe
`remote-node-background-sync`.

Simulate periodic work in a debug build with WorkManager TestDriver (see
`RemoteNodeBackgroundSyncSchedulerTest`).

### iOS BGAppRefreshTask

In Xcode, after launching a debug build:

```bash
e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"org.getnowhere.remote-node-refresh"]
```

(lldb; private API for simulators — use Xcode **Debug → Simulate Background Fetch**
when available.)

Verify the task completes once (`setTaskCompleted`) and reschedules the next
`BGAppRefreshTaskRequest`.

### WebView / JS handler

```bash
npm test -- tests/mobile/background-remote-sync.test.ts
```

## Security notes

- No wallet addresses, peer IDs, room IDs, or decrypted content in native logs.
- No persistent sockets, foreground services, or push/telemetry SDKs.
- App-access lock or locked wallet → background sync returns `no_op` (success).

After a successful background sync, the WebView may also publish privacy-gated
local notifications for newly ingested L1 / L1′ events. See
[`docs/features/local-background-notifications.md`](./features/local-background-notifications.md).

## F-Droid

WorkManager is AndroidX (not GMS). For de-Googling the full mobile Gradle
tree at F-Droid build time, see **TODO: de-Google for F-Droid** in
`docs/builds/expo-eas-android-build.md` (planned Python script, similar to
[acktarius/conceal-2fa](https://github.com/acktarius/conceal-2fa)).
