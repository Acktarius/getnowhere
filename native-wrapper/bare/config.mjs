/** Sidecar limits (same defaults as holepunch-sidecar). @see docs/architecture/holepunch-sidecar.md */

export const config = Object.freeze({
  maxNdjsonLineBytes: 262_144,
  maxFileBytes: 5_242_880,
  maxWsMessageBytes: 270_336,
  maxFramePayloadBytes: 262_144,
});
