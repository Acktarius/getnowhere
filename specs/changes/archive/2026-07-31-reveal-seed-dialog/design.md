# Design: Reveal Seed Dialog

## Context

- `BackupSettingsScreen` verifies passcode then sets `step === "revealed"` and
  mounts `SeedBackupPanel` inline (second reveal + confirm-backup checkbox).
- Seed is already in `walletStore.seedPhrase` (in-memory only) while unlocked.
- Metadata export already uses a modal on the same screen; seed reveal should
  be a dedicated modal (timer UX does not fit `ConfirmModal`).

## Decisions

| Topic | Choice | Alternatives rejected |
|-------|--------|------------------------|
| Dialog content | Warning + seed grid + Got it (+ Need more time) | Full SeedBackupPanel confirm flow |
| Backup confirm | Close only; `// TO BE RE_ASSESS` | Call `confirmBackup` on Got it |
| Component | New `SeedRevealModal` | Reuse ConfirmModal; wrap SeedBackupPanel |
| Timer restart | Fade out → re-fade over 30s | Stay visible disabled |
| Auto-close | 5s after Need more time enabled | No auto-close |
| Onboarding | Unchanged | Unify with settings dialog |

## Flow

```text
Passcode + Reveal seed
  → verify(passcode)
  → open SeedRevealModal(seedPhrase)
  → t=0..30s: Need more time opacity 0→1, disabled
  → t=30s: enable Need more time; start 5s grace
  → Got it | scrim | Esc | grace elapsed → close (no confirmBackup)
  → Need more time → cancel grace; fade out; restart 30s cycle
```

## Component sketch

`SeedRevealModal({ open, seedPhrase, onClose })`

- Scrim + `role="dialog"` panel (match existing modal CSS classes).
- Body: fixed warning string + numbered word grid (can extract shared grid
  markup from `SeedBackupPanel` later if duplication hurts; not required).
- Actions: row with **Got it** (primary) and **Need more time** (secondary;
  opacity driven by elapsed/30, `disabled` until elapsed ≥ 30s).
- Timers: `requestAnimationFrame` or `setInterval` for opacity; `setTimeout`
  for 30s enable + 5s grace. Clear all on unmount/close/restart.
- Tests use Vitest fake timers.

## Risks

- Long seed visibility if operator repeatedly taps Need more time (accepted).
- Opacity animation must stay testable (assert enabled state at 30s, not CSS).

## Out of scope

- `confirmBackup` / backup-acknowledged persistence
- Onboarding seed flow changes
- Decrypting seed from disk (use in-memory phrase only)
