/**
 * Constant-time token compare for Bare bridge IPC.
 * @see holepunch-sidecar/src/auth.mjs
 */

import b4a from "b4a";

/**
 * @param {string} a
 * @param {string} b
 */
export function tokensEqual(a, b) {
  const bufA = b4a.from(String(a));
  const bufB = b4a.from(String(b));
  if (bufA.byteLength !== bufB.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < bufA.byteLength; i++) {
    diff |= bufA[i] ^ bufB[i];
  }
  return diff === 0;
}
