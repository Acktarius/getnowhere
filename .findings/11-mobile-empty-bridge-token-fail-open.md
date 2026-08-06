### [Medium] Empty `requiredToken` disables Bare-side auth (fail-open)

- **Severity:** Medium
- **Confidence:** High
- **Location:** `native-wrapper/bare/bridge.mjs` — `assertAuthorized()` (lines 44–51); `native-wrapper/bare/entry.mjs` (line 19)
- **Issue:** If the worklet starts with an empty `argv[0]` token, all IPC commands are accepted without token checks.
- **Why it matters:** Unlike `holepunch-sidecar` (fail-closed on non-loopback without token), the mobile worklet has no startup guard; a misconfiguration or empty token makes WebView `postMessage` auth the only gate — and with an empty token, any WebView message with `token: ""` passes both layers.
- **Evidence:** `if (!requiredToken) return true;` short-circuits auth. `requiredToken = kit.argv?.[0] ?? ""` with no validation.
- **Suggested solution:** Require non-empty `bridgeToken` before `w.start()` in `GnhMobileBridge.doStart()`; throw in `entry.mjs` if `requiredToken` is empty; mirror sidecar fail-closed policy in docs/tests.
- **Related:** `.findings/06-bridge-auth.md` (sidecar WS auth); OpenSpec `mobile-bridge-hardening`.
- **Residual risk:** Verify no code path constructs `GnhMobileBridge("")` or starts the worklet without argv.

# follow-up

- [x] Refuse to start worklet when `bridgeToken` is empty (`GnhMobileBridge`, `bare/entry.mjs`)
- [x] Remove `if (!requiredToken) return true` fail-open in `bare/bridge.mjs`
- [x] Add regression test: empty argv token rejects commands
- [x] Align docs with sidecar fail-closed policy (`mobile-p2p-runtime.md`)

# remediation (2026-08-06)

- `GnhMobileBridge.doStart()` + constructor validate non-empty token via `assertNonEmptyBridgeToken`.
- `bare/entry.mjs` throws when argv token is empty.
- `bare/workletEnv.mjs`: reads `Bare.argv[0]` first (mobile worklet.start), then `BareKit.argv[0]`.
- `bare/bridge.mjs`: empty `requiredToken` → unauthorized error (fail-closed).
- Regression: `native-wrapper/bare/test/bridge-auth.test.mjs`, `worklet-env.test.mjs`.
