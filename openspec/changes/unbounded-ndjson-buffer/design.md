# Design — Cap unbounded NDJSON buffer

## Context

`createLineReader` is the incremental NDJSON splitter for Hyperswarm `conn`
data. WS bridge messages are already whole-message JSON (not this path).

## Decisions

- **Decision:** Fixed 256 KiB `maxNdjsonLineBytes` in `config.json`.
  - **Alternatives:** (B) 1 MiB; (C) env-only; (D) derive from UI constant.
  - **Rationale:** Generous vs sealed chat frames; config file is easy to tune;
    dual knobs prepare for future files without coupling to UI packages.

- **Decision:** On overflow, clear buffer and throw; handler `conn.destroy()`.
  - **Alternatives:** (B) soft-reset keep connection; (C) also notify WS clients.
  - **Rationale:** Line over the agreed max is a protocol violation; destroy
    avoids stream desync and isolates one peer without killing the sidecar.

- **Decision:** Reserve `maxFileBytes` in config; do not enforce in this change.
  - **Rationale:** Pictures should not ride unbounded NDJSON string reassembly.

- **Decision:** Throw from `createLineReader` rather than return `{ overflow }`.
  - **Rationale:** Callers cannot ignore the signal.

## Risks / Trade-offs

- Legitimate future payloads that exceed 256 KiB on the NDJSON path will trip
  the cap until config is raised or framing changes — intentional.
- Soft peers that corrupt framing lose the connection (acceptable).

## Migration

None. Existing UIs that join and send normal sealed frames need no change.
