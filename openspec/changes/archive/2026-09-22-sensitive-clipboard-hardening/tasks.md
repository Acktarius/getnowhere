## 1. Helper tests then implementation

- [x] 1.1 Add failing tests for `copySensitive` / `clearClipboard`: writes the raw value only; toast on/off; toast never includes the value; Android/Electron extra hint; web/iOS toast has no Clear clipboard line; clear does not read or retain a compare value; failed copy errors omit the identifier
- [x] 1.2 Implement `src/lib/clipboard/sensitiveClipboard.ts` (web/Electron `writeText`; mobile delegates to `gnh-privacy` commands; fail closed on mobile if native is missing) until 1.1 passes

## 2. Presentation components

- [x] 2.1 Add `NonSelectableText`, `CopyButton`, and `SensitiveValue` with tests that Copy writes the raw value and display is non-selectable
- [x] 2.2 Seed reveal and onboarding backup: seed words non-selectable and no Copy; spend/view keys each have Copy via `copySensitive`; Need more time unchanged. Tests cover no seed Copy and key Copy

## 3. Privacy settings

- [x] 3.1 Rename the unused toggle to Clipboard reminder (keep `clearClipboardWarnings`); tips-off / tips-on hint copy; add Clear clipboard button that calls `clearClipboard` and states it wipes whatever is there. Tests for label and clear call

## 4. Call sites

- [x] 4.1 Switch payment ID, address, integrated address, tx hash, and contact share/copy rows to `SensitiveValue` / `copySensitive`. Leave `MarkdownFencedCode` on `useCopy`. Cover any shown room / topic / poke / relationship identifier the same way

## 5. Mobile host

- [x] 5.1 Extend `gnh-privacy` command/response for `copySensitive` and `clearClipboard` (types, injection, JS router tests). Native MUST NOT log the value
- [x] 5.2 Android: `setPrimaryClip` + `EXTRA_IS_SENSITIVE`; `clearPrimaryClip`
- [x] 5.3 iOS: `setItems` with `localOnly` and 60s `expirationDate`; clear writes an empty pasteboard

## 6. Docs

- [x] 6.1 Add `docs/security/clipboard.md` (host table, no later touch, GrapheneOS/Android 13 note) and index it in `docs/README.md`. Update `native-wrapper/docs/gnh-mobile-security-bridge.md` for the new privacy commands

## 7. Product loop

- [x] 7.1 Author `e2e.json` steps that run the helper + settings/seed tests and `npm run types`; `forge e2e run` green
