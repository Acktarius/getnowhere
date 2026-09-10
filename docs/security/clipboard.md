# Sensitive clipboard

How Get NowHere copies identifiers (payment IDs, addresses, tx hashes, keys,
room/topic refs) and how hosts clear them.

UI never calls clipboard APIs for those values. Call `copySensitive` /
`clearClipboard` in `src/lib/clipboard/sensitiveClipboard.ts`, or the
`SensitiveValue` / `CopyButton` wrappers.

## Policy

- Display is non-selectable. Copy is an explicit button that writes the **raw**
  value only (no labels).
- Seed words **and their index numbers** are non-selectable and have **no**
  Copy (`SeedRevealModal`, `SeedBackupPanel`).
- Chat fenced code (`MarkdownFencedCode`) stays on normal `useCopy`.
- Never read the clipboard on mount, focus, in the background, or on a timer.
- Never store a copy or hash of a written value for later compare-and-clear.
- Toasts, logs, analytics, and errors must not include the identifier.
- Settings **Clear clipboard** wipes whatever is on the clipboard. It does not
  read first. The label must say so.

## Host write / clear

| Host | Copy | Auto-clear |
|---|---|---|
| Browser | `navigator.clipboard.writeText` on user gesture | None. User can use **Clear clipboard**. |
| Electron | Same renderer `writeText` | None. Reminder toast points at **Clear clipboard**. |
| Android | Native `setPrimaryClip` + `ClipDescription.EXTRA_IS_SENSITIVE` | None. Mark sensitive at write; do **not** rely on Android 13 ~1h OS clear. Reminder toast points at **Clear clipboard**. |
| iOS | Native `UIPasteboard.setItems` with `localOnly` and `expirationDate` now+60s | System expires the item. App does not read later. |

Mobile UI prefers native `gnh-privacy` **command/response**
(`copySensitive`, `clearClipboard`) so Android can mark the clip sensitive and
iOS can set a 60s expiry. If native is missing, rejects, or does not answer
within 2s, the UI falls back to `navigator.clipboard.writeText` so Copy / Clear
still work (for example after a UI sync without a native rebuild). Native must
not log the value. If both paths fail, a generic error toast is shown.

## GrapheneOS / Android 13

GrapheneOS does not add an app-controlled clipboard timeout. Android 13+ may
clear unused clips on a long OS timer; Get NowHere does not treat that as a
guarantee and does not try to delete “only our” clip from keyboard/OEM history
(no such app API). Clear is the user’s **Clear clipboard** button, which wipes
the current primary clip.

## Settings

- **Clipboard reminder** (`privacy.clearClipboardWarnings`, key unchanged):
  toast after a successful `copySensitive`. Android and Electron add a sentence
  pointing at **Clear clipboard**.
- **Clear clipboard**: unconditional wipe; no read. Shows `Clipboard cleared.`
  or `Clear clipboard failed` — never the clipboard contents. Android overwrites
  the primary clip with empty text, then calls `clearPrimaryClip()`. Keyboard /
  OEM clipboard history cannot be cleared by the app.

@see native-wrapper/docs/gnh-mobile-security-bridge.md
