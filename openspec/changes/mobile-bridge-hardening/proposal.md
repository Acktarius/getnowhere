# Mobile bridge hardening

## Why

Crypto-security review of `native-wrapper/` (2026-08) found eight issues in the
Expo WebView ↔ RN ↔ Bare worklet bridge: unbounded RN IPC buffering, exposed
bridge tokens, weak token entropy fallback, fail-open empty-token auth, permissive
WebView settings, missing rate limits, and missing regression tests.

Findings: `.findings/08-mobile-rn-ipc-line-cap.md` through
`.findings/15-mobile-bridge-auth-tests.md`.

Mobile uses in-process Bare IPC + WebView `postMessage` instead of loopback
WebSocket. Controls should match sidecar parity where applicable
(`docs/architecture/mobile-p2p-runtime.md` § Security parity).

## What Changes

- **08 — RN IPC line cap:** Bound `GnhMobileBridge.onIpcData` reassembly; terminate
  worklet on overflow (parity with `bare/entry.mjs` / finding 04 sidecar fix).
- **09 + 12 — WebView hardening:** Navigation allowlist, tighter origins, stop
  exposing readable `bridgeToken` on `window.gnhMobile`.
- **10 — Token entropy:** Fail closed or use `expo-crypto`; remove `Math.random`
  fallback.
- **11 — Fail-closed auth:** Require non-empty token at worklet startup; remove
  empty-token bypass in `bare/bridge.mjs`.
- **13 — Rate limits:** Per-session throttle on bridge commands; stable
  `rate_limited` error code.
- **14 — Token compare:** Document UUID-only fixed length (no code change unless
  token format changes).
- **15 — Tests:** `bare/test/bridge-auth.test.mjs` + RN IPC cap tests.

## Capabilities

- `p2p-chat-connectivity`: Mobile bridge IPC, auth, and WebView ingress are
  bounded and fail-closed (delta: `specs/p2p-chat-connectivity/spec.md`).

## Impact

- `native-wrapper/src/GnhMobileBridge.ts`, `App.tsx`, `injectMobileBridge.ts`
- `native-wrapper/bare/bridge.mjs`, `bare/entry.mjs`, `bare/errors.mjs`
- `native-wrapper/bare/test/`, docs under `docs/architecture/mobile-p2p-runtime.md`
- Bundled UI CSP/navigation audit (coordination with root `src/` if needed)
- No L1/L2 crypto or protocol payload changes

## Non-goals

- iOS Bare host (Android-only phase B today)
- Replacing WebView with a native RN UI
- Sidecar / Electron changes (covered by separate findings/changes)
