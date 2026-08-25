# Expo EAS Android Build

Primary mobile runbook for Get NowHere. Day-to-day product work stays in the
web app (`npm run dev`). This document covers the `native-wrapper/` Expo shell,
local debug APKs on Ubuntu, and EAS cloud builds.

See also: [`expo-eas-ios-build.md`](expo-eas-ios-build.md),
[`mobile-p2p-runtime.md`](../architecture/mobile-p2p-runtime.md).

## Scope

`native-wrapper` only. Cordova and Capacitor are **not** used — mobile delivery
is Expo SDK **55** + Bare worklet (`react-native-bare-kit`, same stack as
[holepunchto/bare-expo](https://github.com/holepunchto/bare-expo)). Autolinking via Expo
prebuild — do **not** use npm `bare-expo@0.0.0` (empty stub on the registry).

## Why Android first

- Sideload an APK from Ubuntu with Android Studio installed.
- iOS builds still use EAS cloud from Linux (no local Mac required).
- Phase B adds on-device Hyperswarm via a Bare worklet behind `window.gnhMobile`.

## Phase 1 (UI shell) — done

WebView loads bundled Vite `dist/`. Launcher, splash, and branding polish landed
in 2026-08 (see session handoff in `.chat/sessions/`).

## Phase 2 (Bare P2P) — Android MVP

**Status (2026-08):** Verified on Pixel 8a — packed worklet loads, DHT bootstrap,
topic announce, and outbound Hyperswarm connection to Electron desktop peer on the
same room `topicRef`. Full L2 chat + sustained session across NAT still under test.

The wrapper:

- Packs `native-wrapper/bare/` → `assets/bare/app.bundle.mjs` (`bare-pack` 2.2.1)
- Starts a Bare `Worklet` in `App.tsx` before the WebView loads
- Injects `window.gnhMobile` with `sendCommand` / `onBridgeEvent` (token in closure, not on `window`)
- Routes the same bridge schema as `holepunch-sidecar/` (see
  `docs/architecture/mobile-p2p-runtime.md`)

- Android **minSdk 29** required by `react-native-bare-kit` (Expo default is 24).

```bash
npm run holepunch:install    # hyperswarm deps for bare/swarm (symlinked at pack time)
npm run mobile:install       # installs react-native-bare-kit, bare-pack
npm run mobile:test-bare     # swarm security tests (no-hello, connTopics)
```

Rebuild with P2P bundle:

```bash
npm run mobile:sync-ui && npm run mobile:android
```

`prepare-android-assets.mjs` runs `pack-bare` and copies both `ui/` and
`bare/app.bundle.mjs` into `android/app/src/main/assets/`.

After adding `react-native-bare-kit`, changing Expo SDK / `newArchEnabled`, or
**editing `android-native/GnhSecurity/` or `ios-native/GnhSecurity/`**, run once:

```bash
cd native-wrapper && npx expo prebuild --platform android --clean
```

Native security sources are **not** stored under `android/` (gitignored, regenerated).
Edit Kotlin in `native-wrapper/android-native/GnhSecurity/`; Swift in
`native-wrapper/ios-native/GnhSecurity/`. Both are injected by
`plugins/withGnhSecurity.js`.

Keep Metro running when opening a debug build (`npx expo start --clear` in
`native-wrapper/`). A black screen after splash with no `ReactNativeJS` logcat
lines usually means the dev client cannot reach Metro on your LAN.

(`react-native-bare-kit` autolinks via Expo; npm `bare-expo@0.0.0` is a registry
stub — not used.)

### Device P2P test matrix (two Android phones)

Manual verification required on physical hardware:

1. Install the same build on **two** Android devices (USB sideload or internal APK).
2. Create/accept the **same room** on both (matching `topicRef` — compare Room
   diagnostics → **Topic** on both peers).
3. Open the room on both; wait for transport `connecting` → `connected` after
   **L1 post-connect proof** (not peer count alone).
4. Send chat both directions over **L2** (live channel).
5. Optional: confirm **L1′ relay** still works if L2 drops (existing app logic).

NAT / mobile CGNAT: ordinary users must not edit firewalls. If L2 fails across
internet NAT, check `[swarm]` lines via `adb logcat` (see
`docs/architecture/mobile-p2p-runtime.md` § Bare worklet packaging). Same-LAN lab
notes in `holepunch-sidecar.md` apply to developers only.

### Cross-platform test (Android mobile + Electron desktop)

**Mobile** (phone plugged in, USB debugging on, `adb devices` → `device`)

1. **Build and install**:

```bash
npm run mobile:android
# or
npm run mobile:android --no-install
adb install -r im.getnowhere.app
```

Writes `native-wrapper/android/app/build/outputs/apk/debug/app-debug.apk` and installs
on the connected phone. Package: `im.getnowhere.app`.

2. **Optional — Metro debug** (debug APK only; skip for EAS `preview` APKs):

```bash
cd native-wrapper && npx expo start --clear
```

Then open the app on the phone. Black screen after splash → Metro is not reachable on your LAN.

Reinstall an **already-built** APK (second phone, no rebuild):

```bash
adb install -r native-wrapper/android/app/build/outputs/apk/debug/app-debug.apk
```

**Desktop invitee** — `npm run holepunch` + `npm run dev`, or `npm run desktop:alice`.

Then: invite/accept, open the room on both sides, compare **Topic** (`topicRef` must match),
check logcat for `[swarm] topic … announced` → `connection open peer=…`, and confirm transport
**connected** (L1 post-connect proof).

Still **not** in scope: iOS device P2P sign-off (Android security modules ship first).

**Security (2026-08):** `GnhSecurity` native module (Kotlin + Swift via
`plugins/withGnhSecurity.js`) exposes biometric + securePrefs + lifecycle bridge
channels. See `native-wrapper/docs/gnh-mobile-security-bridge.md` and
`docs/features/app-access-and-data-unlock.md`. Device verification pending.

## Follow-ups

Tracked after successful local `npm run mobile:android` sideload.

### Done

| # | Area | Notes |
|---|------|-------|
| 2 | **Settings backup row icon** | `Download` icon on Settings → **Backup** (`SettingsScreen.tsx`). |
| 3 | **Launcher + splash** | `npm run generate:icons` — adaptive safe-zone launcher, splash tile on `#0a0b0f`. See `native-wrapper/README.md`. |
| 4 | **Bare worklet P2P (Android bootstrap)** | Packed bundle + Hyperswarm on device; cross-platform topic join with Electron verified 2026-08. See `mobile-p2p-runtime.md`. |
| 1 | **Biometrics & unlock (code landed)** | Kotlin `GnhBiometricModule` + Swift twin; JS bridge + app/data unlock UI. **Device sign-off pending.** |

### Remaining

| # | Area | Work |
|---|------|------|
| 1b | **Biometrics device QA** | Physical enroll/unlock/invalidation on Android; iOS when WebView shell ships. |
| 5 | **Mobile ↔ desktop L2 session** | Swarm transport opens then `connection reset by peer` — trace L1 post-connect proof / session stability. |
| 6 | **iOS Bare P2P** | Same bundle + `expo prebuild --platform ios`; EAS device test when Android L2 is stable. |

Bare worklet packaging details and Android constraints live in
`docs/architecture/mobile-p2p-runtime.md` § Bare worklet packaging.

## Prerequisites

### Machine (Ubuntu + Android Studio)

- Node 24 (matches root CI).
- Android Studio with SDK Platform (API 34+), Build-Tools, Platform-Tools.
- `ANDROID_HOME` set (typically `~/Android/Sdk`).
- SDK licenses accepted: `sdkmanager --licenses`.
- Physical device (USB debugging) or an AVD emulator.

#### Ubuntu USB device setup

Per [Run apps on a hardware device](https://developer.android.com/studio/run/device),
Linux needs two things beyond Android Studio itself:

1. Your user in the **`plugdev`** group (groups apply after re-login):

```bash
sudo usermod -aG plugdev $LOGNAME
# log out and back in, then:
id | grep plugdev
```

2. Default **udev rules** for Android devices via the distro package (often
   missing on a fresh Ubuntu install — causes `adb devices` → `no permissions`):

```bash
sudo apt-get install android-sdk-platform-tools-common
sudo udevadm control --reload-rules
sudo udevadm trigger
adb kill-server && adb start-server
```

On the phone: enable **USB debugging**, unlock, tap **Allow** when prompted.
Verify:

```bash
adb devices
# 49251JEKB07643    device
```

### Accounts

- [Expo](https://expo.dev) account (EAS subscription for cloud builds).
- EAS CLI installed and logged in (see below).

## Install EAS CLI

Global install (recommended):

```bash
npm install -g eas-cli
eas --version
eas login
eas whoami
```

Without global install:

```bash
npx eas-cli@latest login
```

`eas login` is interactive. Cloud builds require authentication. Local
`expo run:android` works without login; linking the Expo project (`eas init`)
is still recommended before first cloud build.

## Required files

```text
native-wrapper/
├─ app.json
├─ eas.json
├─ package.json
├─ App.tsx
├─ scripts/
│   ├─ sync-ui-dist.mjs
│   └─ prepare-android-assets.mjs
└─ assets/
    ├─ icon.png
    ├─ adaptive-icon.png
    └─ ui/              # synced from root dist/ (gitignored contents)
```

## App identifiers

| Field | Value |
|-------|-------|
| Display name | Get NowHere |
| Expo slug | `get-nowhere-wrapper` |
| Android package | `im.getnowhere.app` |
| iOS bundle ID | `im.getnowhere.app` |

User-facing name **Get NowHere** is dual-read branding (*now here* / *nowhere*).
Technical IDs stay `getnowhere` / `im.getnowhere.app`.

## UI sync workflow

The Vite build is WebView-ready (`base: "./"`, single bundle, inlined WASM).
Before every device build:

```bash
npm run mobile:sync-ui
```

This runs root `npm run build` and copies `dist/` → `native-wrapper/assets/ui/`.

## First APK — local (`expo run:android`)

Recommended first path on this Ubuntu machine:

```bash
# One-time
npm run mobile:install
npm install -g eas-cli
eas login

# Each install to device/emulator
npm run mobile:android
```

What `mobile:android` does:

1. Build and sync Vite `dist/`.
2. `expo prebuild --platform android` (first run generates `android/`, gitignored).
3. Copy `assets/ui/` into `android/app/src/main/assets/ui/` for `file://` load.
4. `expo run:android` — Gradle debug APK install.

The WebView loads `file:///android_asset/ui/index.html`.

`expo-build-properties` sets `android.buildArchs` to **`arm64-v8a` only** (writes
`reactNativeArchitectures` in `gradle.properties`). Release APKs omit
`armeabi-v7a` / `x86` / `x86_64`, which cuts most of the multi-ABI `libbare-kit.so`
bloat. Bare pack uses `--host android-arm64` to match.

## Unsigned release APK (F-Droid path)

Build an **unsigned** release APK locally (same flow as
[conceal-wallet-cordova](https://github.com/ConcealNetwork/conceal-wallet-cordova)
`build-fdroid-reference.sh`): Gradle `assembleRelease` without a release
keystore, then sign separately with `apksigner` or let F-Droid sign.

Set version fields in repo-root `version`:

```text
version=0.2.4
buildversionIos=1
buildVersionAndroid=1
```

- `version` → APK `versionName`
- `buildVersionAndroid` → APK `versionCode`
- `buildversionIos` → reserved for future iOS release builds

```bash
npm run mobile:android:release
```

What it does:

1. `mobile:sync-ui` — build Vite `dist/` and stage into `native-wrapper/assets/ui/`.
2. `prepare-android-assets.mjs` — pack Bare worklet, copy assets into `android/`.
3. Write `native-wrapper/version.properties` from repo-root `version`.
4. Apply `gradle/app-version.gradle` hook + strip release `signingConfig` (unsigned).
5. `./gradlew assembleRelease` (no `clean` — RN new-arch `clean` can fail on Debug codegen JNI).

Output:

```text
native-wrapper/builds/GetNowHere-v{version}-b{buildVersionAndroid}-java{major}.apk
native-wrapper/builds/GetNowHere-v{version}-b{buildVersionAndroid}-java{major}.apk.sha256
```

Requires JDK 17+, `ANDROID_HOME`, and SDK licenses (same as debug build).

### Local install (test signature)

Android rejects **unsigned** APKs (`INSTALL_PARSE_FAILED_NO_CERTIFICATES`).
That is expected — keep the unsigned artifact for F-Droid / reproducible builds.

For sideload on your own device, sign with the standard Expo/RN **debug**
keystore (created by `expo prebuild`; password `android` / alias
`androiddebugkey`). **Not** for Play Store or F-Droid submission.

```bash
# build unsigned, then sign latest builds/*.apk with debug keystore
npm run mobile:android:release:test

# or sign an existing unsigned APK
npm --prefix native-wrapper run android:sign-test -- builds/GetNowHere-v0.2.4-b1-java17.apk
adb install -r native-wrapper/builds/GetNowHere-v0.2.4-b1-java17-signed-test.apk
```

Production / F-Droid: sign the unsigned APK with your release key via
`apksigner` (same as conceal-wallet-cordova after `build-fdroid-reference.sh`).

### F-Droid de-Google cleanup

`scripts/fix-for-fdroid.py` strips `google()` Maven repos and transitive
`com.google.*` dependencies from the generated `android/` tree so the APK is
acceptable to F-Droid. The CI workflow runs it automatically after `expo prebuild`
and before `assembleRelease`.

To audit manually after `expo prebuild`:

```bash
python3 scripts/fix-for-fdroid.py
cd native-wrapper && ./gradlew :app:dependencies --configuration releaseRuntimeClasspath
```

## F-Droid GitHub Actions CI

Trigger: push a tag matching `v*-f-droid` (for example `v0.3.3-f-droid`), or run the
workflow manually via **Actions → Build signed APK (F-Droid) → Run workflow**.

Workflow file: `.github/workflows/build-signed-apk.yml`

What it does:
1. Checks out the repo and installs Node.js 24.
2. Sets up JDK 21 + Android SDK (platforms 35/36, build-tools 34/36).
3. Runs `npx expo prebuild --platform android --clean` to generate the `android/` tree.
4. Runs `scripts/fix-for-fdroid.py` to strip non-free Maven repos / Google deps.
5. Runs `npm run mobile:android:release` → produces an **unsigned** release APK
   under `native-wrapper/builds/`.
6. Reads `version` / `buildVersionAndroid` from the repo-root `version` file
   (artifact names never use the git tag, e.g. not `…-f-droid…`).
7. Decodes the release keystore from GitHub Secrets
   (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_PASSWORD`, `ANDROID_KEY_ALIAS`).
8. Signs the APK with `apksigner` and verifies the signature (keeps
   `GetNowHere-v{version}-b{buildVersionAndroid}-java{major}.apk` from the
   unsigned build — names come from the `version` file, not the git tag).
9. Attaches the signed APK + `.sha256` to the GitHub Release (tag builds) or
   uploads Actions artifact `getnowhere-signed-apk-v{version}` (manual dispatch).

The unsigned build step is identical to local `npm run mobile:android:release`.
Signing is injected **only** in CI from secrets; the repo never contains a
release keystore.

### F-Droid de-Google cleanup

The workflow runs `scripts/fix-for-fdroid.py` automatically after `expo prebuild`
and before `assembleRelease`. It strips `google()` Maven repos and transitive
`com.google.*` dependencies from the generated `android/` tree so the APK is
acceptable to F-Droid.

To audit locally after `expo prebuild`:

```bash
python3 scripts/fix-for-fdroid.py
cd native-wrapper && ./gradlew :app:dependencies --configuration releaseRuntimeClasspath
```

## EAS cloud builds (later)

From `native-wrapper/` after `eas build:configure`:

```bash
# Internal APK (sideload)
npx eas build --platform android --profile preview

# Play Store bundle
npx eas build --platform android --profile production
```

Local EAS build (same pipeline, your machine):

```bash
npx eas build --platform android --profile preview --local
```

Run `npm run mobile:sync-ui` before cloud/local EAS builds so the uploaded
project includes a fresh UI bundle.

## Build profiles (`eas.json`)

| Profile | Output | Use |
|---------|--------|-----|
| `development` | APK + dev client | Native debugging |
| `preview` | APK | Internal sideload / QA |
| `production` | AAB | Play Store |

## Troubleshooting

| Symptom | Check |
|---------|-------|
| `adb`: **no permissions** | `plugdev` group + `android-sdk-platform-tools-common`; replug USB |
| `adb`: **unauthorized** | Unlock phone; accept USB debugging prompt |
| Blank WebView | Ran `mobile:sync-ui`? `assets/ui/index.html` exists? |
| Gradle fails | **JDK 17+** required (Gradle 9 rejects JVM 8); set `JAVA_HOME` |
| `ANDROID_HOME` errors | SDK path, Studio install, shell env |
| `file://` blocked | WebView props: `allowFileAccess`, asset copy script ran |
| Missing dist | Root `npm run build` before sync |

## Team rules

- Wrapper is packaging + future Bare host — not core product logic.
- Keep profiles in `native-wrapper/eas.json`.
- Do not add Cordova/Capacitor or `hyperswarm` to the Vite app.
- Document identifier, signing, or load-behavior changes in this file.

## Policy text

> Get NowHere is developed as a web-first application. Local work happens with
> `npm run dev`. Android APKs are built from `native-wrapper/` via
> `expo run:android` (local) or EAS Build (cloud). Desktop uses Electron.
> Hyperswarm on mobile will run in a Bare worklet, not WebView JS.
