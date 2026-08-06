### [High] Unbounded IPC line buffer on RN bridge reader

- **Severity:** High
- **Confidence:** High
- **Location:** `native-wrapper/src/GnhMobileBridge.ts` — `onIpcData()` (lines 87–102)
- **Issue:** Worklet → RN IPC uses an unbounded string buffer with no max line length, unlike the Bare worklet path.
- **Why it matters:** A compromised or buggy worklet can stream bytes without `\n` (or one very long line) and grow `lineBuf` until the RN host OOMs — local DoS of the app process.
- **Evidence:** `onIpcData` appends all decoded bytes to `this.lineBuf` and only splits on `\n`; there is no cap or error path. Bare `entry.mjs` uses `createLineReader(config.maxWsMessageBytes)` with explicit oversize handling.
- **Suggested solution:** Port the same `createLineReader` limits to `GnhMobileBridge` (reuse `config.maxNdjsonLineBytes` / `maxWsMessageBytes` parity); on oversize, drop the buffer, terminate the worklet, and stop accepting IPC.
- **Related:** `.findings/04-unbounded-ndjson-buffer.md` (sidecar Hyperswarm path — fixed); OpenSpec `mobile-bridge-hardening`.
- **Residual risk:** Confirm BareKit IPC cannot be written by any native component other than the started worklet.

# follow-up

- [ ] Cap RN-side IPC line reassembly in `GnhMobileBridge.onIpcData` (match `bare/config.mjs` limits)
- [ ] On overflow: clear buffer, terminate worklet, reject further IPC
- [ ] Add regression test for oversize partial line / single mega-line
- [ ] Document limit in `docs/architecture/mobile-p2p-runtime.md`
