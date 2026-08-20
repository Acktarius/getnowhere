# Tasks

## 1. SeedRevealModal

- [x] 1.1 Add failing tests in `tests/components/SeedRevealModal.test.tsx`:
  open shows warning + words; Got it / scrim call `onClose`; Need more time
  disabled before 30s, enabled at 30s; click restarts (disabled again); 5s
  grace after enable auto-closes if not clicked. Use fake timers.
- [x] 1.2 Implement `src/components/SeedRevealModal.tsx` to pass those tests
  (fade opacity, 30s enable, 5s grace, restart cycle A).

## 2. Backup settings wiring

- [x] 2.1 Add/update tests in `tests/screens/BackupSettingsScreen.test.tsx`
  (create if missing): wrong passcode stays locked; correct passcode + Reveal
  opens modal with seed; closing clears modal (and passcode). Assert no
  `confirmBackup` call — leave `// TO BE RE_ASSESS` in production code.
- [x] 2.2 Update `src/screens/settings/BackupSettingsScreen.tsx`: remove inline
  `SeedBackupPanel` reveal path; open `SeedRevealModal` after verify success.

## 3. Product-loop evidence

- [x] 3.1 Ensure `e2e.json` steps run the SeedRevealModal + Backup settings
  vitest files and pass (`forge e2e run` green at verify).
