# Get NowHere — native wrapper

Expo shell for Android/iOS packaging. Loads the Vite UI from `assets/ui/` (synced
from root `dist/`) and hosts a **Bare Hyperswarm worklet** for on-device P2P.

Runbook: [`docs/builds/expo-eas-android-build.md`](../docs/builds/expo-eas-android-build.md) ·
[`docs/builds/expo-eas-ios-build.md`](../docs/builds/expo-eas-ios-build.md)  
Architecture: [`docs/architecture/mobile-p2p-runtime.md`](../docs/architecture/mobile-p2p-runtime.md)

```bash
# From repo root
npm run holepunch:install   # once — bare/swarm links these deps at pack time
npm run mobile:install
npm run mobile:android      # sync UI, pack bare bundle, install debug APK
npm run mobile:test-bare    # swarm security unit tests (no-hello, connTopics)
```

**P2P path:** WebView UI → `window.gnhMobile` (postMessage) → `GnhMobileBridge` →
Bare worklet IPC → same bridge schema as `holepunch-sidecar/`. The Vite app never
imports `hyperswarm`.

**Launcher icon:** brand PNGs from `public/icon.svg`. Adaptive foreground uses
Android’s ~66% safe zone:

```bash
cd native-wrapper && npm run generate:icons
npm run mobile:android
```

**Splash:** brand tile `#161922` on `#0a0b0f` — matches WelcomeScreen `BrandMark`.

Cordova/Capacitor are not used. `desktop-electron/` is untouched.

**Follow-ups:** app access / data unlock biometrics (`docs/features/app-access-and-data-unlock.md`);
mobile↔desktop L2 session stability; iOS device P2P — see Android runbook § Follow-ups.
