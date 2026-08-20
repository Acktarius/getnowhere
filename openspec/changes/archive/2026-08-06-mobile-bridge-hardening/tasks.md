# Tasks

Tracked findings: `.findings/08` … `.findings/15`. OpenSpec change:
`mobile-bridge-hardening`.

## 1. RN IPC line cap — finding 08 (TDD)
- [x] 1.1 Add test (TS or integration) for `GnhMobileBridge.onIpcData`: partial
  line over max clears buffer and terminates worklet; valid line under cap still
  parses. Expect fail before fix.
- [x] 1.2 Implement line cap in `GnhMobileBridge` (shared limit constant matching
  `bare/config.mjs`). On overflow: clear `lineBuf`, terminate worklet. Make 1.1
  pass.
- [x] 1.3 Update `docs/architecture/mobile-p2p-runtime.md` and mark follow-up in
  `.findings/08-mobile-rn-ipc-line-cap.md`.

## 2. Fail-closed bridge token — findings 10, 11 (TDD)
- [x] 2.1 Add `bare/test/bridge-auth.test.mjs`: wrong token, missing token, empty
  argv token (expect reject). Expect fail before fix.
- [x] 2.2 Remove `Math.random` fallback in `App.tsx` / `GnhMobileBridge`; fail
  closed or use `expo-crypto` when CSPRNG missing.
- [x] 2.3 Require non-empty token in `GnhMobileBridge.doStart()` and
  `bare/entry.mjs`; remove `if (!requiredToken) return true` in
  `bare/bridge.mjs`. Make 2.1 pass.
- [x] 2.4 Update `.findings/10-mobile-bridge-token-entropy.md` and
  `.findings/11-mobile-empty-bridge-token-fail-open.md`.

## 3. WebView hardening — findings 09, 12
- [x] 3.1 Remove readable `bridgeToken` from injected `window.gnhMobile`; keep
  token in closure. Update `HolepunchSidecarClient` mobile path if it reads
  `bridgeToken`.
- [x] 3.2 Add `onShouldStartLoadWithRequest` allowlisting asset UI; tighten
  `originWhitelist`; remove `allowUniversalAccessFromFileURLs` if tests pass.
- [x] 3.3 Regression-test bundled UI load (offline assets, workers). Update docs
  and findings 09 / 12 follow-ups.

## 4. Rate limiting — finding 13 (TDD)
- [x] 4.1 Add `rate_limited` to `bare/errors.mjs` and bridge error map docs.
- [x] 4.2 Implement token-bucket (or sliding window) in `bare/bridge.mjs`; optional
  early reject in `handleWebViewMessage`. Add burst regression test.
- [x] 4.3 Update `.findings/13-mobile-bridge-rate-limit.md` and
  `mobile-p2p-runtime.md`.

## 5. Tests and low-priority — findings 14, 15
- [x] 5.1 Ensure `npm run test:bare` runs `bridge-auth.test.mjs` and swarm tests.
- [x] 5.2 Document UUID-only fixed-length bridge tokens (finding 14); no code change
  unless format changes.
- [x] 5.3 Mark `.findings/14` and `.findings/15` follow-ups complete when done.

## 6. Verify
- [x] 6.1 Run `npm run test:bare` from `native-wrapper/`.
- [x] 6.2 Manual smoke: Android APK, open room, join topic, send frame (peer connect verified; re-run after bare bundle changes).
- [x] 6.3 Run `forge e2e run --change mobile-bridge-hardening` (includes bundled UI audit vitest).
