## Context

See proposal.md — Why. Today `deleteWalletData()` clears native enrollments via
`clearAllMobileBiometricEnrollments()` but preserves all of `gnh.settings`,
including biometric booleans. App Lock is gated solely on
`appAccessBiometricEnabled` in `App.tsx`.

## Goals / Non-Goals

**Goals:**

- Keep delete-vs-reset split (prefs survive delete) while biometric *capability*
  flags reset with enrollment wipe.
- Heal installs already stuck after delete+reimport without requiring Reset app
  data.

**Non-Goals:**

- Auto re-enroll after import; enroll UX changes; Electron/web biometrics.

## Decisions

1. **Reset flags inside `deleteWalletData`** via settings store setters (or a
   small helper that persists both flags false) after enrollment clear.
   Alternative: remove entire `gnh.settings` on delete — rejected (breaks
   delete-vs-reset theme retention).

2. **Reconcile helper** checks app-access credential presence (securePrefs /
   existing clear-path probe). If flag true and missing →
   `setAppAccessBiometric(false)`. Call before App Lock gate (boot /
   `useMobileAppAccess` or `App.tsx` ready path). Also clear
   `dataUnlockBiometricEnabled` when data-unlock enrollment is missing so
   Security UI does not lie.

3. **Fail closed on reconcile errors**: if enrollment probe fails (bridge down),
   prefer clearing the gate rather than trapping the user — auth risk is
   re-enable in settings after import, not silent lockout.

## Risks / Trade-offs

- [False clear if probe wrong] → Use same credential key as enroll/clear
  (`gnh.appAccessCredentialId`); cover with unit tests.
- [Stuck users on old APK until update] → Document Reset app data as immediate
  escape; reconcile ships in next build.

## Migration Plan

Ship in next F-Droid / EAS build. No data migration schema. Stuck devices heal
on first launch after update (reconcile) or immediately if user deletes again
with the fixed build.
