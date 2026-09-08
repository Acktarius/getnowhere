## Context

See proposal.md for motivation. Today every Copy button uses `useCopy` →
`navigator.clipboard.writeText`. Privacy `clearClipboardWarnings` is stored
but unread. Mobile already has `gnh-privacy` (blur only) and
`isMobileAndroid()`. Electron is `window.gnhDesktop`. iOS 60s expiry needs
`UIPasteboard` options the WebView Clipboard API cannot set.

## Goals / Non-Goals

**Goals:**

- One host-aware write/clear module; UI never talks to clipboard APIs for
  secrets
- iOS expiry at write time; Android marks the clip sensitive when writing
- Settings reminder + unconditional clear
- Non-selectable display + explicit Copy on listed identifiers

**Non-Goals:**

- Compare-and-clear, hashing the value, or any later clipboard read
- Changing `useCopy` callers that are not secrets
- New Settings persistence key (keep `clearClipboardWarnings`)
- Screenshot blocking beyond the existing app-switcher blur setting

## Decisions

### 1. Central module, not per-component clipboard calls

`copySensitive` / `clearClipboard` live in one module (e.g.
`src/lib/clipboard/sensitiveClipboard.ts`). Components call that API or
wrap it in `SensitiveValue` / `CopyButton`.

**Alternative:** keep `useCopy` and add a flag — rejected; too easy to miss
host rules and toast gating.

### 2. Host write adapter

| Host | Copy | Clear |
|---|---|---|
| Web | `navigator.clipboard.writeText` | `writeText("")` |
| Electron | same (renderer, user gesture) | same |
| Android | native `setPrimaryClip` + `EXTRA_IS_SENSITIVE` | `clearPrimaryClip()` |
| iOS | native `setItems` with `localOnly` + `expirationDate` +60s | empty pasteboard |

On mobile, extend `gnh-privacy` with command/response actions
`copySensitive` and `clearClipboard` (not fire-and-forget events) so the UI
knows whether to toast. Native MUST NOT log the value. If native is missing,
rejects, or hangs, fall back to `navigator.clipboard.writeText` so Copy / Clear
still work.

**Alternative:** Electron main-process clipboard — rejected; no later touch
and no expiry API needed on desktop.

**Alternative:** JS-only on iOS — rejected; cannot set `expirationDate`.

### 3. Keep the existing settings flag

Rename the UI to **Clipboard reminder**. Keep
`privacy.clearClipboardWarnings` so stored settings do not migrate.

Tips-off / tips-on copy is fixed in the proposal.

Toast extra sentence when `isMobileAndroid()` or `window.gnhDesktop` is set.

### 4. Seed vs keys

`SeedRevealModal` and `SeedBackupPanel`: wrap seed words in
`NonSelectableText`, no Copy. Keys in the reveal dialog: `SensitiveValue`
each. Need more time unchanged.

### 5. Call-site inventory

Switch from `useCopy` to `copySensitive` / `SensitiveValue`:

- `PaymentIdField`, `ReceiveSheet`, `WalletScreen` (address + tx hash)
- `ContactDetailScreen` (address, payment ID, `ShareRow`)
- Spend/view keys
- Any shown room / topic / poke / relationship identifier

Leave `MarkdownFencedCode` on `useCopy`.

### 6. Docs

`docs/security/clipboard.md`: policy table, GrapheneOS note (no OS timeout
of our own; do not rely on Android 13 ~1h clear), no later read. Index from
`docs/README.md`.

## Risks / Trade-offs

- [Web/Electron leftover clipboard] → Mitigation: reminder toast (Electron)
  and Clear clipboard; iOS expires at 60s
- [Clear clipboard wipes a newer user copy] → Mitigation: explicit button
  only; label says it clears whatever is there
- [Native bridge adds a secret-crossing path] → Mitigation: command only on
  user gesture; no log of value; no retain after write
- [Android WebView `writeText` fallback if native missing] → Prefer native
  (sensitive flag / iOS expiry). If native is missing, rejects, or hangs,
  fall back to `writeText` so Copy / Clear still work. Show a generic error
  toast only when both paths fail.

## Migration Plan

Ship together: helper, UI call sites, settings, mobile bridge, docs. Rollback
is revert. Existing `clearClipboardWarnings: true` becomes the reminder
default (already the store default).
