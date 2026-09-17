# Android GnhSecurity native sources

Kotlin modules for `GnhSecurity` React Native bridge. Edit sources here.

Gradle `preBuild` copies this directory into generated `android/`
(`plugins/gnhSecurityNativeSync.js`). `expo prebuild` also copies on generate /
`--clean`. **Do not edit Kotlin only under `android/`** — that tree is
gitignored and wiped by `prebuild --clean`.

Parity with iOS `ios-native/GnhSecurity/`: native-only decrypt — wallet password
ciphertext stays in Keystore; WebView receives password only after biometric
success.

After changing these files, `npx expo run:android` is enough. Re-run prebuild
only when adding **new** iOS native files or regenerating the project:

```bash
cd native-wrapper && npx expo prebuild --platform android
```

Module name: `GnhSecurity` (same JS contract as iOS).
