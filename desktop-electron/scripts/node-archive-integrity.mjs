/**
 * SHA-256 checks for the bundled Node archive.
 * @see docs/builds/github-pages-and-desktop.md
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * @param {string} text official Node `SHASUMS256.txt`
 * @param {string} filename archive basename only
 */
export function parseShasumsExpectedHex(text, filename) {
  if (!filename || filename.includes("/") || filename.includes("\\")) {
    throw new Error("archive filename must be a basename");
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([0-9a-f]{64})\s+(\S+)$/i);
    if (!match) continue;
    if (match[2] === filename) return match[1].toLowerCase();
  }
  throw new Error(`SHASUMS256.txt has no entry for ${filename}`);
}

/** @param {string} filePath */
export async function sha256FileHex(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

/** @param {string} actualHex @param {string} expectedHex */
export function hashesEqual(actualHex, expectedHex) {
  const a = Buffer.from(actualHex, "hex");
  const b = Buffer.from(expectedHex, "hex");
  if (a.length !== 32 || b.length !== 32) return false;
  return timingSafeEqual(a, b);
}

/** @param {string} filePath @param {string} expectedHex */
export async function assertFileMatchesSha256(filePath, expectedHex) {
  const actual = await sha256FileHex(filePath);
  const expected = expectedHex.toLowerCase();
  if (!HEX64.test(expected) || !hashesEqual(actual, expected)) {
    throw new Error(
      `SHA-256 mismatch for ${filePath}: expected ${expected}, got ${actual}`,
    );
  }
}
