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

- [ ] Stop publishing readable `bridgeToken` on `window.gnhMobile` (RN-only secret channel)
- [ ] Add `onShouldStartLoadWithRequest` allowlisting `file:///android_asset/ui/`
- [ ] Tighten `originWhitelist` and drop unnecessary universal file access flags
- [ ] Audit bundled UI (`assets/ui/`) for XSS / external script loads
- [ ] Document WebView trust model in `docs/architecture/mobile-p2p-runtime.md`
