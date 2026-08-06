### [Medium] No rate limiting on bridge commands

- **Severity:** Medium
- **Confidence:** High
- **Location:** `native-wrapper/src/GnhMobileBridge.ts` — `handleWebViewMessage()`; `native-wrapper/bare/bridge.mjs` — `handleCommand()`
- **Issue:** There is no per-session throttle on `join`, `leave`, or `frame` commands.
- **Why it matters:** A WebView script with a valid token (or empty-token misconfig) can flood join/frame traffic → CPU, DHT churn, and memory pressure; amplifies DoS alongside the unbounded IPC reader issue.
- **Evidence:** Commands are forwarded immediately after token/channel checks; only byte-size limits exist, not message rate.
- **Suggested solution:** Add simple per-type rate limits (token bucket or sliding window) in `handleWebViewMessage` and/or `bare/bridge.mjs`; return `{ type: "error", code: "rate_limited" }` when exceeded.
- **Related:** `.findings/08-mobile-rn-ipc-line-cap.md`; OpenSpec `mobile-bridge-hardening`.
- **Residual risk:** Tune limits so legitimate reconnect/refresh behavior still works.

# follow-up

- [ ] Define per-command rate limits (join / leave / frame / ping)
- [ ] Enforce at RN ingress and/or `bare/bridge.mjs`
- [ ] Add stable `rate_limited` error code to bridge error map
- [ ] Add regression test for burst rejection
- [ ] Document limits in `mobile-p2p-runtime.md`
