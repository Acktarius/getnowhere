# iOS GnhSecurity native sources

Swift + ObjC bridge for `GnhSecurity` React Native module. Copied into the Xcode
project by `plugins/withGnhSecurity.js` on `expo prebuild`.

Android Kotlin sources live in `android-native/GnhSecurity/` (same plugin).

Parity with Android `GnhBiometricModule.kt`: native-only decrypt — wallet password
never stored in WebView; Keychain + LocalAuthentication gate access.

After prebuild:

```bash
cd native-wrapper && npx expo prebuild --platform ios
```

Module name: `GnhSecurity` (same JS contract as Android).
