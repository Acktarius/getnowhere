# Reveal Seed Dialog (Backup settings)

## Why

Backup settings currently swaps the page to `SeedBackupPanel` after passcode
verification, and that panel still requires a second reveal tap before the
words appear. Operators expect a single path: enter passcode → Reveal → see
the seed in a dialog for offline copy, then dismiss.

## What Changes

- After correct passcode + **Reveal seed**, open a dedicated `SeedRevealModal`
  instead of rendering `SeedBackupPanel` inline on Backup settings.
- Dialog shows restore warning copy, the seed word grid, **Got it**, and a
  timed **Need more time** control (fade-in over 30s, enable at 30s, 5s grace
  then auto-close; restart fades out and re-fades).
- **Got it** / scrim / Esc / auto-close clear dialog + passcode; do **not**
  call `confirmBackup` (code comment `// TO BE RE_ASSESS`).
- Onboarding `SeedBackupPanel` path unchanged.

## Capabilities

- `settings-backup`: passcode-gated seed reveal via timed dialog on Backup
  settings (delta: `specs/settings-backup/spec.md`)

## Impact

- UI: `BackupSettingsScreen.tsx`, new `SeedRevealModal.tsx`
- Tests: component + screen tests with fake timers
- No wallet crypto / persist contract changes
- Risk: seed remains visible on screen until dismiss/auto-close (intentional)
