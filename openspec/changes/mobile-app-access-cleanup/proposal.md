# Proposal: mobile-app-access-cleanup

## Why

App-access lock shipped with a phantom numeric passcode, immediate background lock, and a background-sleep poll cutoff that do not match product intent. Import users never set a passcode, so the unlock gate never appears.

## What

- Remove app passcode entirely; wallet password is the only data secret.
- Remove background sleep setting and poll cutoff.
- Auto-lock only when `appAccessBiometricEnabled`: idle-in-foreground OR timed background.
- App lock screen: biometric retry only (no passcode field).
- Cold start with app bio on: splash → app lock → then in-app or Welcome Open wallet.

## Scope

Mobile (`gnhMobile`) only for auto-lock. Web/Electron unchanged.
