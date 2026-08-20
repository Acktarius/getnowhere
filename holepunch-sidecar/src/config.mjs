/**
 * Sidecar limits from config.json with hardcoded defaults.
 * @see docs/architecture/holepunch-sidecar.md
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {{ maxNdjsonLineBytes: number, maxFileBytes: number, maxWsMessageBytes: number, maxFramePayloadBytes: number }} */
export const DEFAULTS = {
  maxNdjsonLineBytes: 262_144,
  maxFileBytes: 5_242_880,
  maxWsMessageBytes: 270_336,
  maxFramePayloadBytes: 262_144,
};

/**
 * Load `holepunch-sidecar/config.json`, falling back to DEFAULTS.
 * @returns {{ maxNdjsonLineBytes: number, maxFileBytes: number, maxWsMessageBytes: number, maxFramePayloadBytes: number }}
 */
export function loadConfig() {
  try {
    const path = join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "config.json",
    );
    const raw = JSON.parse(readFileSync(path, "utf8"));
    return {
      maxNdjsonLineBytes:
        typeof raw.maxNdjsonLineBytes === "number"
          ? raw.maxNdjsonLineBytes
          : DEFAULTS.maxNdjsonLineBytes,
      maxFileBytes:
        typeof raw.maxFileBytes === "number"
          ? raw.maxFileBytes
          : DEFAULTS.maxFileBytes,
      maxWsMessageBytes:
        typeof raw.maxWsMessageBytes === "number"
          ? raw.maxWsMessageBytes
          : DEFAULTS.maxWsMessageBytes,
      maxFramePayloadBytes:
        typeof raw.maxFramePayloadBytes === "number"
          ? raw.maxFramePayloadBytes
          : DEFAULTS.maxFramePayloadBytes,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export const config = loadConfig();
