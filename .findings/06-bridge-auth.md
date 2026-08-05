### [Medium] Bridge auth is optional and compared with non-constant-time equality

- **Severity:** Medium
- **Confidence:** High
- **Location:** `holepunch-sidecar/src/server.mjs` — connection handler (~37–49)
- **Issue:** If `GNH_SIDECAR_TOKEN` is unset, any client may connect; when set, `clientToken !== requiredToken` is used, and the secret is passed as a URL query parameter.
- **Why it matters:** Default web-dev matches the documented threat model (L3 assumes an untrusted bridge), but binding `HOLEPUNCH_HOST` off loopback without a token exposes join/frame control on the LAN. Query tokens can leak via process listings, logs, and crash reports; string `!==` is not timing-safe.
- **Evidence:** `requiredToken = process.env.GNH_SIDECAR_TOKEN ?? ""`; auth block skipped when empty; token read from `url.searchParams.get("token")`; comparison is raw `!==`.
- **Suggested solution:** Require token whenever host is non-loopback; compare with `crypto.timingSafeEqual` on equal-length buffers; prefer a header (or already-authenticated IPC) over `?token=` where possible.
- **Residual risk:** Confirm packaged Electron always sets a per-launch token (outside this folder) and that web-dev remains an explicit exception.

# follow-up

- [ ] Require sidecar token whenever `HOLEPUNCH_HOST` is non-loopback
- [ ] Compare tokens with `crypto.timingSafeEqual` (equal-length buffers)
- [ ] Prefer header / IPC over `?token=` where a safer channel exists
- [ ] Confirm packaged Electron always sets a per-launch token
- [ ] Keep web-dev untokend loopback as an explicit, documented exception
