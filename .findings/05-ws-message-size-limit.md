### [Medium] No WS message / payload size limit on the bridge

- **Severity:** Medium
- **Confidence:** High
- **Location:** `holepunch-sidecar/src/server.mjs` — `ws.on("message")`
- **Issue:** Bridge messages are `JSON.parse`’d with no max length on `raw` or `payload`.
- **Why it matters:** A local (or token-holding) client can send huge frames, stressing CPU/memory and amplifying fan-out to peers.
- **Evidence:** Message handler parses `String(raw)` directly; `frame` only checks `typeof` string fields.
- **Suggested solution:** Enforce max WS message bytes and max `payload` length before parse/fan-out; close abusive sockets.
- **Residual risk:** Align limits with L3 envelope size and Electron/web clients.

# follow-up

- [ ] Enforce max WS message bytes before `JSON.parse`
- [ ] Enforce max `payload` length on `frame` commands
- [ ] Close abusive sockets that exceed limits
- [ ] Align limits with L3 envelope size and Electron/web clients
- [ ] Add regression test: oversized bridge message is rejected
