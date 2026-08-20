# Cap unbounded NDJSON buffer

## Why

Hyperswarm connection data is reassembled into NDJSON lines by appending chunks
to a string with no size limit until a newline arrives. A malicious peer can
stream without `\n` and grow sidecar memory until the process dies — taking down
every room on that runtime.

Finding: `.findings/04-unbounded-ndjson-buffer.md` (Medium).

## What Changes

- Add `holepunch-sidecar/config.json` with `maxNdjsonLineBytes` (262144) and
  reserved `maxFileBytes` (5242880), loaded via `src/config.mjs`.
- Cap `createLineReader`: on overflow, clear the buffer and throw; the
  connection handler destroys that Hyperswarm connection.
- Regression tests for oversized partial lines and connection destroy.
- Document limits in `docs/architecture/holepunch-sidecar.md`; update finding 04.

## Capabilities

- `p2p-chat-connectivity`: NDJSON reassembly on Hyperswarm connections is
  bounded; overflow destroys the offending connection.

## Impact

- `holepunch-sidecar/config.json`, `src/config.mjs`, `src/swarm.mjs`, tests, docs.
- Legitimate sealed chat frames (hundreds of bytes) are unaffected.
- Future media must use a separate path bound by `maxFileBytes`, not raise the
  NDJSON line cap to photo size.
