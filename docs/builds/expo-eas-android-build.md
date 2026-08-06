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

After adding `react-native-bare-kit`, or changing Expo SDK / `newArchEnabled` in
`app.json`, run once:

```bash
cd native-wrapper && npx expo prebuild --platform android --clean
```

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

1. Mobile: `npm run mobile:sync-ui && npm run mobile:android` (Metro for debug builds).
2. Desktop invitee: `npm run holepunch` + `npm run dev`, or `npm run desktop:alice`.
3. Complete invite/accept; open the room on both sides.
4. Compare **Topic** in room diagnostics — `topicRef` must match.
5. Mobile logcat: `[swarm] topic … announced`, then `connection open peer=…`.
6. UI must reach transport **connected** (L1 post-connect proof), not peer count alone.

Still **not** in scope: native secure storage, biometrics unlock, iOS device P2P
sign-off.

## Follow-ups

Tracked after successful local `npm run mobile:android` sideload.

### Done

| # | Area | Notes |
|---|------|-------|
| 2 | **Settings backup row icon** | `Download` icon on Settings → **Backup** (`SettingsScreen.tsx`). |
| 3 | **Launcher + splash** | `npm run generate:icons` — adaptive safe-zone launcher, splash tile on `#0a0b0f`. See `native-wrapper/README.md`. |
| 4 | **Bare worklet P2P (Android bootstrap)** | Packed bundle + Hyperswarm on device; cross-platform topic join with Electron verified 2026-08. See `mobile-p2p-runtime.md`. |

### Remaining

| # | Area | Work |
|---|------|------|
| 1 | **Biometrics & unlock** | Wire fingerprint / device passcode / optional 2FA — replace onboarding and Settings placeholders. Native bridge + tests on physical device. |
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
