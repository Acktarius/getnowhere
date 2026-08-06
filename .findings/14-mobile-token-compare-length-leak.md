### [Low] Token compare leaks length via early return

- **Severity:** Low
- **Confidence:** High
- **Location:** `native-wrapper/src/tokensEqual.ts` (lines 7–8); `native-wrapper/bare/auth.mjs` (lines 15–16)
- **Issue:** `tokensEqual` returns immediately on UTF-8 byte-length mismatch before the constant-time loop.
- **Why it matters:** Theoretically leaks token length to a local timing observer; low practical impact for fixed-length UUID tokens.
- **Evidence:** `if (bufA.byteLength !== bufB.byteLength) return false;` before XOR accumulation.
- **Suggested solution:** For UUID-only tokens, document fixed length and keep compare; or pad/hash tokens before compare if variable-length tokens are ever used.
- **Related:** `.findings/06-bridge-auth.md` (sidecar uses `timingSafeEqual` with same length check); OpenSpec `mobile-bridge-hardening`.
- **Residual risk:** Negligible for current UUID tokens; revisit if token format changes.

# follow-up

- [x] Document that bridge tokens are fixed-length UUID v4 (no variable-length tokens)
- [ ] Optional: align with sidecar `timingSafeEqual` if a shared helper is introduced
- [ ] Revisit only if token format changes from UUID

# remediation (2026-08-06)

- Documented UUID-only fixed-length policy in `docs/architecture/mobile-p2p-runtime.md` § WebView trust model.
