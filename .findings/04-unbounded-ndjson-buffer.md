### [Medium] Unbounded NDJSON reassembly buffer (connection memory DoS)

- **Severity:** Medium
- **Confidence:** High
- **Location:** `holepunch-sidecar/src/swarm.mjs` — `createLineReader`
- **Issue:** Chunks are appended to a string buffer with no max size until a newline arrives.
- **Why it matters:** A malicious peer (or local WS client if a similar parse path is added) can stream data without `\n` and grow memory until the sidecar process is killed—availability loss for all rooms on that runtime.
- **Evidence:** `buf += …` in `push` with no length cap; malformed lines are ignored but partial lines are retained forever.
- **Suggested solution:** Cap buffer size (and/or max line length); on overflow, destroy the connection and reset the reader.
- **Remediation:** `maxNdjsonLineBytes` (default 262144) via `config.json` / `config.mjs`; `createLineReader` clears buf and throws `NdjsonLineTooLongError`; swarm `conn.on("data")` catches overflow, logs peer, and `conn.destroy()`. Reserved `maxFileBytes` unused for chat NDJSON.
- **Residual risk:** Limit should stay aligned with max sealed frame size used by the app; WS path has its own framing.

# follow-up

- [x] Cap NDJSON reassembly / max line length in `createLineReader`
- [x] On overflow: reset reader and destroy the offending connection
- [x] Align limit with max sealed frame size used by the UI
- [x] Add regression test: oversized partial line closes / rejects the connection
