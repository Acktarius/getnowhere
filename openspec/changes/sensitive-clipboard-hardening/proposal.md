# Sensitive clipboard hardening

## Why

Sensitive identifiers are selectable in the UI and copied through `useCopy`
with no expiry. GrapheneOS and Android 13 do not give a short, reliable
clipboard lifetime. Casual select/copy and leftover clipboard data are the
problem now.

## What Changes

- Add a single sensitive-copy path (`copySensitive`) that writes the raw
  identifier only. UI components must not call clipboard APIs for secrets.
- Render those values as non-selectable text with an explicit Copy button.
- Seed phrase stays display-only (no Copy). Spend key and view key each get
  a Copy button.
- Rename the unused Privacy toggle to **Clipboard reminder**. After a
  successful sensitive copy, optionally toast (never include the value).
  Android and Electron toasts also point at **Clear clipboard**.
- Add a Privacy **Clear clipboard** button that wipes the system clipboard
  unconditionally (no read, no stored value).
- iOS: write with `localOnly` and 60-second `expirationDate`. Other hosts:
  no later touch. Never read the clipboard on a timer, mount, or focus.
- Document the policy under `docs/security/`.

## Capabilities

### New Capabilities

- `sensitive-clipboard`: explicit copy of identifiers, non-selectable
  display, reminder toast, manual clear, host write rules (including iOS
  60s expiry).

### Modified Capabilities

_(none)_

## Impact

- New clipboard helper + `SensitiveValue` / `CopyButton` / `NonSelectableText`
- Call sites: payment IDs, addresses, integrated address, tx hash, contact
  share rows, spend/view keys; room-style IDs if shown
- Privacy settings: reminder toggle + Clear clipboard button
- `SeedRevealModal` / `SeedBackupPanel`: seed non-selectable, no Copy
- Mobile: extend `gnh-privacy` so native iOS/Android can expire/mark/clear
- Docs: `docs/security/clipboard.md` + `docs/README.md` index
- Tests for helper, toast gating, seed/keys UI, settings
- `useCopy` remains for chat/markdown and other non-secret copy
