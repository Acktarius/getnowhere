# Get NowHere — native wrapper

Expo shell for Android/iOS packaging. Loads the Vite UI from `assets/ui/` (synced
from root `dist/`).

Runbook: [`docs/builds/expo-eas-android-build.md`](../docs/builds/expo-eas-android-build.md)

```bash
# From repo root
npm run mobile:android
```

**Launcher icon:** brand PNGs come from `public/icon.svg`. Adaptive foreground is
scaled to Android’s ~66% safe zone so both rings stay visible (not cropped to the
inner mark). Gradle uses `mipmap-*` from `expo prebuild`:

```bash
cd native-wrapper && npm run generate:icons   # PNGs + refresh mipmap-* if android/ exists
npm run mobile:android
```

**Splash:** full brand tile (`#161922` / `--bg-elev-2`) on page background
`#0a0b0f` (`--bg`) — matches WelcomeScreen `BrandMark`.

Cordova/Capacitor are not used. Bare Hyperswarm worklet is phase 2.

**Follow-ups:** biometrics & unlock only — see
[`docs/builds/expo-eas-android-build.md`](../docs/builds/expo-eas-android-build.md)
§ Follow-ups.
