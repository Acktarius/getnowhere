# Expo EAS iOS Build

This document explains how Get NowHere uses Expo.dev / EAS for the iOS build
and TestFlight / App Store delivery path. Day-to-day product work stays in the
web app (`npm run dev`). Packaging lives in `native-wrapper/`.

See also: [`expo-eas-android-build.md`](expo-eas-android-build.md),
[`peer-wake-notification.md`](../features/peer-wake-notification.md),
[`poke-gateway/README.md`](../../poke-gateway/README.md).

## Scope

`native-wrapper` only. Builds run on **EAS cloud from Linux** (no local Mac /
Xcode required). Target is **iPhone only** (`supportsTablet: false`).

## Identifiers

| Field | Value |
|-------|-------|
| Display name | Get NowHere |
| Expo slug | `get-nowhere-wrapper` |
| iOS bundle ID | `im.getnowhere.app` |
| Apple App ID | same bundle ID, Push Notifications enabled (**no** Broadcast) |

## Prerequisites

- Expo account + EAS CLI (`npm install -g eas-cli` then `eas login`)
- Paid Apple Developer team that owns `im.getnowhere.app`
- App Store Connect app for that bundle ID (needed for TestFlight submit)
- Root `.env` with `VITE_POKE_GATEWAY_URL` and `VITE_NTFY_READ_TOKEN` before UI sync
- For peer wake on device: poke-gateway on the VPS with APNs AuthKey (below)

## Build profiles (`eas.json`)

| Profile | Platform | Distribution | Use |
|---------|----------|--------------|-----|
| `preview` | Android | internal APK | Sideload / QA (unchanged) |
| `preview-ios` | iOS | **store** | TestFlight from Linux |
| `adhoc-ios` | iOS | **internal** (ad hoc) | Direct install on registered UDIDs (no TestFlight) |
| `production` | iOS / Android | store / AAB | Later App Store / Play |

`distribution` is profile-wide in EAS, so iOS TestFlight uses **`preview-ios`**
instead of overloading Android `preview`. Direct phone install without TestFlight
uses **`adhoc-ios`** (Apple ad hoc; device UDID must be registered first).

## Bake UI env, then cloud-build (TestFlight)

Root `VITE_*` values are compiled into the WebView bundle **on your machine**.
The APNs AuthKey (`.p8`) is **never** sent to EAS — only poke-gateway on the VPS
uses it.

```bash
# From repo root — requires root .env (VITE_POKE_GATEWAY_URL, VITE_NTFY_READ_TOKEN)
npm run mobile:sync-ui

cd native-wrapper
npx eas build --platform ios --profile preview-ios
npx eas submit --platform ios --profile preview-ios --latest
```

**EAS build lifecycle (iOS):**

1. `eas-build-pre-install` — installs `holepunch-sidecar` deps and creates
   `bare/node_modules → holepunch-sidecar/node_modules` symlink **before**
   CocoaPods runs. This is required so `pod install` → `BareKit/link.mjs` can
   find `udx-native` prebuilds and emit `udx-native.xcframework` into
   `react-native-bare-kit/ios/addons/`. Without this step the app crashes at
   launch with `ADDON_NOT_FOUND: Cannot find addon '.' from udx-native/binding.js`.
2. CocoaPods (`pod install`) — runs `BareKit` podspec `prepare_command` which
   calls `link.mjs`, discovers every native addon under `native-wrapper/`
   (including via the symlink) and writes their XCFrameworks to `ios/addons/`.
3. `eas-build-post-install` — packs the Bare JS bundle into
   `assets/bare/app.bundle` (symlink already exists; no re-linking needed).
4. Xcode build — picks up `addons/*.xcframework` vendored by BareKit podspec.

iOS WebView UI: config plugin `withGnhIosUiBundle` adds an Xcode Run Script that
copies `assets/ui` into the app bundle as `ui/` at build time (no extra npm
deps). Android still uses `prepare-android-assets` / `android_asset` (F-Droid
unchanged).

Keep Expo modules on the SDK 55 line (`npx expo install --check`). An old
`expo-notifications@0.32.x` build fails Xcode with `EXSharedApplication` not
in scope. iOS profiles pin `"image": "sdk-55"`.

Swift 6 (Xcode 26): AppDelegate uses `internal import …`; GnhBackgroundSync
must match (`internal import BackgroundTasks`). The background-sync config
plugin must not rewrite `internal import Expo` into a plain `import Expo`.
Do not override `applicationDidEnterBackground` on ExpoAppDelegate — schedule
via `UIApplication.didEnterBackgroundNotification` instead.
EAS will prompt for Apple credentials (signing / App Store Connect). That is
separate from the poke-gateway `.p8`.

Optional later:

```bash
npx eas build --platform ios --profile production --auto-submit
```

## Ad hoc install (no TestFlight)

Register each iPhone UDID once, then build `adhoc-ios`. Safari install link from EAS works only for devices in that provisioning profile. Add a new phone later → register UDID → rebuild.

```bash
cd native-wrapper
npx eas device:create
# open the enrollment URL on the iPhone (or pass --udid)

# From repo root after device is listed
npm run mobile:sync-ui
cd native-wrapper
npx eas build --platform ios --profile adhoc-ios
```

When the build finishes, open the Expo install page / QR on the **same** registered iPhone → Install → if needed trust the cert under **Settings → General → VPN & Device Management**.

## APNs AuthKey for poke-gateway (`.p8`, not `.pk8`)

Peer wake on iOS: the app registers a device token with poke-gateway; the
gateway signs APNs HTTP/2 requests with your AuthKey. **Do not commit the key.**

### 1. Create the App ID (topic) if missing

1. [Identifiers](https://developer.apple.com/account/resources/identifiers/list) → **+** → App IDs → App
2. Description: `Get NowHere`
3. Bundle ID **Explicit**: `im.getnowhere.app`
4. Capability: **Push Notifications** only — leave **Broadcast** off
5. Register

### 2. Create the AuthKey

1. [Keys](https://developer.apple.com/account/resources/authkeys/list) → **+**
2. Name: `GetNowHere APNs`
3. Enable Apple Push Notifications service (APNs)
4. Environment: **Production** (TestFlight / App Store; gateway has one key path today)
5. Restriction: topic **`im.getnowhere.app`** when offered
6. Register → note **Key ID** and **Team ID** (Membership) → download `.p8` once

### 3. Place on the VPS

Compose mounts `./secrets` → `/secrets` and expects `AuthKey.p8`:

```bash
# On VPS
sudo mkdir -p /opt/poke-gateway/secrets
sudo chown "$USER:$USER" /opt/poke-gateway/secrets
chmod 700 /opt/poke-gateway/secrets
```

```bash
# From your laptop (rename Apple download to AuthKey.p8)
scp AuthKey_XXXXXXXXXX.p8 user@YOUR_VPS:/opt/poke-gateway/secrets/AuthKey.p8
```

```bash
# On VPS
chmod 600 /opt/poke-gateway/secrets/AuthKey.p8
```

In `/opt/poke-gateway/.env`:

```bash
APNS_TEAM_ID=YOUR_TEAM_ID
APNS_KEY_ID=YOUR_KEY_ID
APNS_KEY_PATH=/secrets/AuthKey.p8
APNS_BUNDLE_ID=im.getnowhere.app
```

```bash
cd /opt/poke-gateway && docker compose up -d
```

`poke-gateway/secrets/` is gitignored. Never upload this key to EAS.

## Required files

```text
native-wrapper/
├─ app.json      # ios.bundleIdentifier, supportsTablet: false
├─ eas.json      # preview-ios → store / TestFlight
├─ package.json
├─ assets/
└─ src/
```

## Team rules

- Wrapper is packaging + Bare host — not core product logic.
- Keep profiles in `native-wrapper/eas.json`.
- Document identifier, signing, or APNs placement changes in this file.
- Do not put `APNS_*` or `NTFY_PUBLISH_TOKEN` in the app / EAS env.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| EAS asks for Apple login | Expected for signing / submit |
| Push never arrives (TestFlight) | VPS `.p8` + `APNS_*`; Production key; app registered token with `env: production` |
| Forever spinner (old IPA) | Pre-shell stub; rebuild with WebView enabled |
| Stuck on splash logo | Splash hides on iOS mount; need `mobile:sync-ui` so `assets/ui` exists (Xcode Copy GNH WebView UI phase) |
| Blank WebView | Ran `mobile:sync-ui` with correct root `.env`? Check EAS log for “Copied WebView UI” |
| Wrong bundle / topic | App ID, `app.json`, and `APNS_BUNDLE_ID` all `im.getnowhere.app` |
| Crash: `ADDON_NOT_FOUND udx-native` | `eas-build-pre-install` must create `bare/node_modules` symlink before `pod install`; verify EAS log shows "Linking bare/node_modules" in phase 1 |
| Crash: `ReferenceError: process is not defined` (BareKit) | BareKit 0.13.x does not expose `process` as a global. `entry.mjs` must guard `process.on` with `typeof process !== 'undefined'`. |

## Policy text

> Get NowHere is developed as a web-first application. Local work happens with
> `npm run dev`. Expo.dev / EAS is used for the mobile native wrapper, iOS
> builds, signing, TestFlight, and App Store delivery. Desktop packaging uses
> Electron (`desktop-electron/`). APNs AuthKeys stay on the poke-gateway host.
