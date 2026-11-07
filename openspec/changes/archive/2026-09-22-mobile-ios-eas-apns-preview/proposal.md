## Why

F-Droid Android builds are working. iOS packaging from Linux needs Expo EAS remote builds (phone-only, TestFlight preview), and poke-gateway APNs AuthKey (`.p8`) operator setup must be documented so peer wake works on iPhones.

## What Changes

- Set native-wrapper iOS to **phone-only** (`supportsTablet: false`); keep bundle id `im.getnowhere.app`.
- Add EAS **`preview-ios`** profile with **`distribution: "store"`** for TestFlight from Linux (Android `preview` stays internal APK).
- Document APNs AuthKey creation and VPS placement (`.p8` at `poke-gateway/secrets/AuthKey.p8`, Production + topic `im.getnowhere.app`, no Broadcast).
- Cross-link poke-gateway README to the iOS build APNs checklist.

## Capabilities

### New Capabilities

- `mobile-ios-eas-packaging`: Phone-only Expo iOS config, EAS preview → TestFlight from Linux, and operator APNs AuthKey (`.p8`) placement contract for poke-gateway.

### Modified Capabilities

- (none)

## Impact

- `native-wrapper/app.json`, `native-wrapper/eas.json`
- `docs/builds/expo-eas-ios-build.md`, `poke-gateway/README.md`
- Operator VPS secrets (gitignored); no poke-gateway send-path code changes
