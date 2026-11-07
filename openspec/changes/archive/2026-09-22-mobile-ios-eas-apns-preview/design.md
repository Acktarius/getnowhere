## Context

See proposal.md — Why. Today `native-wrapper/eas.json` is Android-oriented; `app.json` already has `ios.bundleIdentifier: im.getnowhere.app` but `supportsTablet: true`. poke-gateway already mounts `./secrets` → `/secrets` and expects `AuthKey.p8`; operator has placed the Production key on the VPS.

## Goals / Non-Goals

**Goals:**

- Phone-only iOS Expo config
- EAS `preview` iOS → TestFlight (`distribution: "store"`)
- Docs: App ID + `.p8` checklist + EAS commands from Linux
- README cross-link for poke-gateway APNs

**Non-Goals:**

- Running `eas build` / `eas submit` in CI or agent session
- Dual sandbox+production key support in poke-gateway
- Changing APNs send/register application code
- Committing secrets

## Decisions

1. **Config + docs only** — Operator owns Apple credentials and EAS CLI. Alternatives: scaffold Expo projectId in-repo (needs interactive login); trigger first cloud build from agent (rejected: credentials/interactive).

2. **TestFlight via `preview-ios` + store distribution** — EAS `distribution` is profile-wide; keep Android `preview` as internal APK and use `preview-ios` for store/TestFlight. Alternative: ad-hoc internal (faster for 1–2 devices, worse for more testers).

3. **Single Production AuthKey** — Fits current one-path gateway and TestFlight. Alternative: unrestricted legacy key (fine if portal offers); sandbox-only key deferred.

4. **Docs live in `docs/builds/expo-eas-ios-build.md`** — Existing iOS runbook; extend rather than new doc tree. poke-gateway README links only.

5. **Env split** — `poke-gateway/.env` (`APNS_*`, `NTFY_PUBLISH_TOKEN`) never goes to EAS. Root `VITE_POKE_GATEWAY_URL` / `VITE_NTFY_READ_TOKEN` are baked into the WebView bundle via local `npm run mobile:sync-ui` before `eas build` (same pattern as F-Droid CI). EAS signs the IPA; it does not receive the AuthKey `.p8`.

## Risks / Trade-offs

- [Production-only key fails sandbox/dev pushes] → Mitigate: document TestFlight-first; sandbox second key later if needed.
- [EAS credentials / ASC app missing] → Mitigate: docs list prerequisites; operator creates App Store Connect app when submitting.
- [Bundle id mismatch] → Mitigate: keep `im.getnowhere.app` aligned across app.json, Apple App ID, `APNS_BUNDLE_ID`.

## Migration Plan

1. Merge config + docs.
2. Operator already has VPS `.p8` — verify `.env` and `docker compose up -d`.
3. Operator: `eas login`, `mobile:sync-ui`, `eas build --platform ios --profile preview-ios`, then submit to TestFlight.
4. Rollback: revert `app.json` / `eas.json` / docs; leave VPS secrets in place (harmless).
