### [High] WebView compromise grants full bridge control

- **Severity:** High
- **Confidence:** Medium
- **Location:** `native-wrapper/src/injectMobileBridge.ts` — `buildMobileBridgeInjection()`; `native-wrapper/App.tsx` — WebView props (lines 106–114)
- **Issue:** The per-launch `bridgeToken` is exposed in the WebView JS world (`window.gnhMobile.bridgeToken`), and WebView hardening is permissive.
- **Why it matters:** Any script running in the WebView (XSS in bundled UI, injected content, or navigation to untrusted URLs) can call `ReactNativeWebView.postMessage` with the token and issue `join` / `frame` commands — full Hyperswarm transport control for that session.
- **Evidence:** Injection sets `bridgeToken: token` and embeds the token in every command. WebView enables `originWhitelist={["*"]}`, `allowUniversalAccessFromFileURLs`, and `allowFileAccessFromFileURLs` with no `onShouldStartLoadWithRequest` / URL allowlist.
- **Suggested solution:** Restrict navigation to `file:///android_asset/ui/` via `onShouldStartLoadWithRequest`; remove `allowUniversalAccessFromFileURLs` if not required; tighten `originWhitelist`; add strict CSP in the bundled UI; do not expose the raw token on `window` (RN-native command channel only, or one-way postMessage without readable secret).
- **Related:** `.findings/12-mobile-webview-file-access.md`; OpenSpec `mobile-bridge-hardening`.
- **Residual risk:** Audit the Vite bundle for XSS sinks and any external script/load paths; verify Android WebView behavior with the exact asset layout.

# follow-up

- [x] Stop publishing readable `bridgeToken` on `window.gnhMobile` (RN-only secret channel)
- [x] Add `onShouldStartLoadWithRequest` allowlisting `file:///android_asset/ui/`
- [x] Tighten `originWhitelist` and drop unnecessary universal file access flags
- [x] Audit bundled UI (`assets/ui/`) for XSS / external script loads
- [x] Document WebView trust model in `docs/architecture/mobile-p2p-runtime.md`

# remediation (2026-08-06)

- `injectMobileBridge.ts`: token held in closure; `window.gnhMobile` exposes only `sendCommand` / `onBridgeEvent`.
- `HolepunchSidecarClient.ts`: detects mobile bridge via API surface, not `bridgeToken`.
- `App.tsx` + `webviewNavigation.ts`: asset-only `originWhitelist`, `onShouldStartLoadWithRequest`, removed `allowUniversalAccessFromFileURLs`.
- Regression: `tests/native-wrapper/inject-mobile-bridge.test.ts`, `webview-navigation.test.ts`.

# remediation (2026-08-06, audit)

- `src/` grep: no `innerHTML`, `dangerouslySetInnerHTML`, or `eval` sinks.
- Bundled `assets/ui/index.html`: single local `./assets/index-*.js` module; no external scripts.
- `sync-ui-dist.mjs` + `bundled-ui-audit.mjs`: strip Google Fonts CDN links on mobile sync; fail if external script URLs appear.
- Regression: `tests/native-wrapper/bundled-ui-audit.test.ts`.
