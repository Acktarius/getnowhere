## 1. Expo iOS config

- [x] 1.1 Set `ios.supportsTablet` to `false` in `native-wrapper/app.json`; keep `bundleIdentifier` `im.getnowhere.app`
- [x] 1.2 Add EAS `preview-ios` with store distribution for TestFlight; preserve Android `preview` (internal APK)

## 2. Documentation

- [x] 2.1 Update `docs/builds/expo-eas-ios-build.md`: phone-only, TestFlight preview from Linux, APNs App ID + Production `.p8` checklist (VPS only; never EAS), and `mobile:sync-ui` baking root `VITE_*` before `eas build`
- [x] 2.2 Cross-link APNs checklist from `poke-gateway/README.md`

## 3. Verify

- [x] 3.1 Confirm `poke-gateway/secrets/` remains gitignored and no `.p8` is staged
- [x] 3.2 Spot-check `eas.json` / `app.json` JSON validity and doc command snippets match design
