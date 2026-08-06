### [Medium] Weak bridge-token fallback when `crypto.randomUUID` is missing

- **Severity:** Medium
- **Confidence:** High
- **Location:** `native-wrapper/App.tsx` — `createBridgeToken()` (lines 21–25); `native-wrapper/src/GnhMobileBridge.ts` — constructor (lines 32–36)
- **Issue:** Bridge auth falls back to `Date.now()` + `Math.random()` when `globalThis.crypto.randomUUID` is unavailable.
- **Why it matters:** The fallback is predictable/guessable compared to a UUID v4, weakening the only bridge auth gate if an attacker can issue many guesses in-process (malicious WebView script or hooked RN).
- **Evidence:** Both call sites use the same `randomUUID() ?? \`gnh-${Date.now()}-${Math.random()...}\`` pattern with no hard failure when CSPRNG is missing.
- **Suggested solution:** Fail closed (refuse to start bridge/worklet) if `crypto.getRandomValues` / `randomUUID` is unavailable; or use `expo-crypto` for a guaranteed CSPRNG-backed token.
- **Related:** OpenSpec `mobile-bridge-hardening`.
- **Residual risk:** Confirm Hermes/RN 0.83 on target devices always exposes `crypto.randomUUID` in production builds.

# follow-up

- [x] Remove `Math.random` / `Date.now` bridge-token fallback
- [x] Fail closed at startup when CSPRNG is unavailable (or use `expo-crypto`)
- [x] Add unit test asserting token generation rejects missing CSPRNG
- [ ] Verify production Hermes builds expose `crypto.randomUUID`

# remediation (2026-08-06)

- `bridgeToken.ts`: `createBridgeToken()` uses `crypto.randomUUID` or UUID v4 from `getRandomValues` (conceal-lib-js uses the same primitive); throws if Web Crypto is missing.
- `App.tsx`: skips bridge/worklet when token generation fails.
- Regression: `tests/native-wrapper/bridge-token.test.ts`.
