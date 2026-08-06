### [Medium] Permissive WebView file/universal access expands attack surface

- **Severity:** Medium
- **Confidence:** High
- **Location:** `native-wrapper/App.tsx` — WebView props (lines 106–109)
- **Issue:** `allowUniversalAccessFromFileURLs` and broad `originWhitelist` weaken same-origin isolation for `file://` content.
- **Why it matters:** Increases reach of file-origin XSS (cross-file reads, unexpected fetches) and makes safe navigation policy more important; pairs badly with exposed `bridgeToken`.
- **Evidence:** Props explicitly set as above; no complementary navigation lockdown.
- **Suggested solution:** Drop universal/file cross-access flags not strictly needed for `android_asset` UI; allowlist only `file:///android_asset/ui/`; block `http(s)://`, `intent://`, and other schemes unless explicitly required.
- **Related:** `.findings/09-mobile-webview-bridge-token-exposure.md`; OpenSpec `mobile-bridge-hardening`.
- **Residual risk:** Regression-test offline UI load and any Web Worker / asset paths after tightening.

# follow-up

- [ ] Remove `allowUniversalAccessFromFileURLs` if not required for bundled UI
- [ ] Replace `originWhitelist={["*"]}` with asset-only allowlist
- [ ] Add `onShouldStartLoadWithRequest` blocking non-asset schemes
- [ ] Regression-test offline UI + workers after WebView tightening
