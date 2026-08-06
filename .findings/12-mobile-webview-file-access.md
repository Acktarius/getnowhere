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

- [x] Remove `allowUniversalAccessFromFileURLs` if not required for bundled UI
- [x] Replace `originWhitelist={["*"]}` with asset-only allowlist
- [x] Add `onShouldStartLoadWithRequest` blocking non-asset schemes
- [x] Regression-test offline UI + workers after WebView tightening (manual Android smoke — P2P connect verified 2026-08-06)

# remediation (2026-08-06)

- Removed `allowUniversalAccessFromFileURLs`; kept `allowFileAccess` + `allowFileAccessFromFileURLs` for packaged asset loads.
- `webviewNavigation.ts`: `WEBVIEW_ORIGIN_WHITELIST` + `isAllowedWebViewNavigationUrl`.
- Unit tests cover allow/deny URL policy; device smoke: peer connect + chat path OK after `Bare.argv[0]` token fix.
