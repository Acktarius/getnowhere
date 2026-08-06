### [Low] Missing bridge-auth regression tests

- **Severity:** Low
- **Confidence:** High
- **Location:** `native-wrapper/bare/test/` — only `swarm-security.test.mjs`; no tests for `bridge.mjs` / `GnhMobileBridge`
- **Issue:** Swarm isolation is tested, but token auth, empty-token fail-open, and RN IPC size limits are not.
- **Why it matters:** Auth and IPC regressions can ship silently; sidecar has dedicated `bridge-auth.test.mjs`.
- **Evidence:** `npm run test:bare` runs swarm tests only; no coverage for `assertAuthorized`, wrong token, or oversize RN IPC.
- **Suggested solution:** Add `bare/test/bridge-auth.test.mjs` (wrong/missing/empty token) and a small TS test or integration check for RN IPC line limits.
- **Related:** `.findings/11-mobile-empty-bridge-token-fail-open.md`, `.findings/08-mobile-rn-ipc-line-cap.md`; OpenSpec `mobile-bridge-hardening`.
- **Residual risk:** Manual QA still needed for WebView ↔ RN ↔ worklet end-to-end.

# follow-up

- [ ] Add `bare/test/bridge-auth.test.mjs` (wrong / missing / empty token)
- [ ] Add RN-side IPC line-cap test for `GnhMobileBridge`
- [ ] Wire tests into `npm run test:bare` / CI
- [ ] Mirror sidecar `holepunch-sidecar/test/bridge-auth.test.mjs` coverage where applicable
