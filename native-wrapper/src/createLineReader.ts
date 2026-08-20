import { MAX_NDJSON_LINE_BYTES } from "./bridgeLimits";

/** Pending NDJSON line exceeded maxNdjsonLineBytes. */
export class NdjsonLineTooLongError extends Error {
  constructor(message = "NDJSON line too long") {
    super(message);
    this.name = "NdjsonLineTooLongError";
  }
}

function chunkToString(chunk: Uint8Array | string): string {
  return typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
}

/** Incremental NDJSON splitter (parity with bare/swarm.mjs createLineReader). */
export function createLineReader(maxBytes = MAX_NDJSON_LINE_BYTES) {
  let buf = "";
  return {
    push(chunk: Uint8Array | string): unknown[] {
      const piece = chunkToString(chunk);
      const out: unknown[] = [];
      let offset = 0;
      while (offset < piece.length) {
        const nl = piece.indexOf("\n", offset);
        if (nl < 0) {
          const rest = piece.slice(offset);
          if (buf.length + rest.length > maxBytes) {
            buf = "";
            throw new NdjsonLineTooLongError();
          }
          buf += rest;
          break;
        }
        const line = buf + piece.slice(offset, nl);
        buf = "";
        offset = nl + 1;
        if (!line.trim()) continue;
        if (line.length > maxBytes) {
          throw new NdjsonLineTooLongError();
        }
        try {
          out.push(JSON.parse(line));
        } catch {
          /* ignore malformed line */
        }
      }
      return out;
    },
    reset(): void {
      buf = "";
    },
  };
}
