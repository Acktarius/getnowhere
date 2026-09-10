## 1. Tests first

- [x] 1.1 Add unit tests for `handleSaveTextFileWebViewMessage` / save helpers: mock `Platform`, `expo-sharing`, and file APIs; assert iOS calls share sheet (not SAF), Android still uses SAF, and cancel/unavailable maps to `ok: false`
- [x] 1.2 Run the new tests and confirm they fail before the implementation change

## 2. Native save path

- [x] 2.1 Implement iOS cache-file + `Sharing.shareAsync` path in `native-wrapper/src/saveTextFileFromWebView.ts` (mime/UTI as in design); keep Android SAF; gate SAF so it never runs on iOS
- [x] 2.2 Best-effort delete of the iOS cache file after share settles; clear module comment to describe both platforms
- [x] 2.3 Re-run unit tests and confirm they pass

## 3. Docs

- [x] 3.1 Add a one-line note that iOS Backup download uses the system share sheet (Save to Files) in `docs/features/lite-wallet.md` and/or `docs/builds/expo-eas-ios-build.md`
