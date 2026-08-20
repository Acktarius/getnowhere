# Android GnhSecurity native sources

Kotlin modules for `GnhSecurity` React Native bridge. Copied into the Gradle
project by `plugins/withGnhSecurity.js` on `expo prebuild --platform android`.

**Do not edit Kotlin only under `android/`** — that folder is generated and
wiped by `prebuild --clean`. Edit sources here instead.

Parity with iOS `ios-native/GnhSecurity/`: native-only decrypt — wallet password
ciphertext stays in Keystore; WebView receives password only after biometric
success.

After changing these files:

```bash
cd native-wrapper && npx expo prebuild --platform android
```

Module name: `GnhSecurity` (same JS contract as iOS).
