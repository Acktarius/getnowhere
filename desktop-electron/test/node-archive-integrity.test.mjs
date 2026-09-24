/**
 * Node archive SHA-256 helpers (SEC-2026-030).
 * @see docs/builds/github-pages-and-desktop.md
 */

import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  assertFileMatchesSha256,
  hashesEqual,
  parseShasumsExpectedHex,
  sha256FileHex,
} from "../scripts/node-archive-integrity.mjs";

const linuxX64 =
  "ace9fa104992ed0829642629c46ca7bd7fd6e76278cb96c958c4b387d29658ea";
const shasums = `${linuxX64}  node-v24.14.1-linux-x64.tar.gz
6e50ce5498c0cebc20fd39ab3ff5df836ed2f8a8c46ca7bd7fd6e76278cb96c9  node-v24.14.1-win-x64.zip
`;

describe("parseShasumsExpectedHex", () => {
  it("reads the official two-space hash line", () => {
    assert.equal(
      parseShasumsExpectedHex(shasums, "node-v24.14.1-linux-x64.tar.gz"),
      linuxX64,
    );
  });

  it("rejects a missing basename", () => {
    assert.throws(
      () => parseShasumsExpectedHex(shasums, "node-v1.0.0-linux-x64.tar.gz"),
      /no entry/,
    );
  });

  it("rejects a path-shaped filename", () => {
    assert.throws(
      () => parseShasumsExpectedHex(shasums, "dir/node-v24.14.1-linux-x64.tar.gz"),
      /basename/,
    );
  });
});

describe("assertFileMatchesSha256", () => {
  it("accepts a matching file and rejects a swap", async () => {
    const path = join(tmpdir(), `gnh-node-integrity-${process.pid}.bin`);
    writeFileSync(path, "ok");
    const hex = await sha256FileHex(path);
    await assertFileMatchesSha256(path, hex);
    assert.equal(hashesEqual(hex, hex), true);
    await assert.rejects(
      () => assertFileMatchesSha256(path, linuxX64),
      /SHA-256 mismatch/,
    );
  });
});
