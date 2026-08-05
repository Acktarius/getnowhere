# Expo EAS Android Build

Primary mobile runbook for Get NowHere. Day-to-day product work stays in the
web app (`npm run dev`). This document covers the `native-wrapper/` Expo shell,
local debug APKs on Ubuntu, and EAS cloud builds.

See also: [`expo-eas-ios-build.md`](expo-eas-ios-build.md),
[`mobile-p2p-runtime.md`](../architecture/mobile-p2p-runtime.md).

## Scope

`native-wrapper` only. Cordova and Capacitor are **not** used — mobile delivery
is Expo + Bare worklet (Bare is phase 2; phase 1 is WebView UI shell only).

## Why Android first

- Sideload an APK from Ubuntu with Android Studio installed.
- iOS builds still use EAS cloud from Linux (no local Mac required).
- Validates WebView loading of the Vite `dist/` bundle before Bare P2P lands.

## Phase 1 limits

The current wrapper loads the bundled Vite UI in a WebView. It does **not**
include the Bare Hyperswarm worklet yet:

- No on-device P2P / chat transport (sidecar bridge unavailable on phone).
- Wallet UI and onboarding can be exercised; secrets still use WebView
  `localStorage` until a native `StorageAdapter` is wired.

## Prerequisites

### Machine (Ubuntu + Android Studio)

- Node 24 (matches root CI).
- Android Studio with SDK Platform (API 34+), Build-Tools, Platform-Tools.
- `ANDROID_HOME` set (typically `~/Android/Sdk`).
- SDK licenses accepted: `sdkmanager --licenses`.
- Physical device (USB debugging) or an AVD emulator.

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
