## Why

On iOS, Settings → Backup → download `wallet.json` fails because the native
host always calls Android-only `StorageAccessFramework`. Operators cannot
export an encrypted wallet backup from the iOS build until the host uses an
iOS-supported save path.

## What Changes

- Native WebView `gnh-file` save handler branches by platform:
  - **Android:** keep Storage Access Framework (Downloads/Files folder pick).
  - **iOS:** write a temp `.json` under cache and present the system share
    sheet via `expo-sharing` (Save to Files / AirDrop / etc.).
- Cancel, share unavailable, or share failure still resolves the bridge with
  `ok: false` and a clear message (same promise contract as today).
- Unit tests cover the platform branch with mocks.
- Docs note that iOS backup export uses the share sheet.
- No change to Web UI, `downloadJson`, or `gnh-file` message shape.

## Capabilities

### New Capabilities

- `mobile-wallet-file-export`: Native-host save of wallet backup text for
  mobile WebView (`gnh-file`), including Android SAF and iOS share-sheet paths.

### Modified Capabilities

- (none — settings Backup UI already offers Download; this change defines
  host export behavior that was never spec’d per platform.)

## Impact

- Code: `native-wrapper/src/saveTextFileFromWebView.ts` (primary);
  `tests/native-wrapper/save-text-file.test.ts` (or sibling).
- Deps: existing `expo-sharing` / `expo-file-system` (already in
  `native-wrapper`).
- Docs: short note in `docs/features/lite-wallet.md` (Backup) and/or iOS
  build docs.
- Out of scope: Android UX changes, iOS Documents file-sharing entitlement,
  bridge schema changes.
