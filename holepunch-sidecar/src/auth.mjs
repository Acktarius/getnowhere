/**
 * Loopback host check and constant-time token compare for bridge auth.
 * @see openspec/changes/bridge-auth/design.md
 */

import { timingSafeEqual } from "node:crypto";

/**
 * True only for 127.0.0.1, ::1, and localhost (ASCII case-insensitive).
 * @param {string} host
 * @returns {boolean}
 */
export function isLoopbackHost(host) {
  if (host === "127.0.0.1" || host === "::1") return true;
  if (typeof host === "string" && host.toLowerCase() === "localhost") return true;
  return false;
}

/**
 * Constant-time UTF-8 token compare; length mismatch rejects without timingSafeEqual.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function tokensEqual(a, b) {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
