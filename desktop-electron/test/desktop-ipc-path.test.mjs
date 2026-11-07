/**
 * Unix socket directory for the desktop sidecar IPC path.
 * @see docs/architecture/electron-desktop.md
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  ensureSidecarIpcRuntimeDir,
  generateSidecarIpcPath,
  resolveSharedBridgeToken,
} from "../desktop-ipc-path.mjs";

describe("sidecar IPC path", () => {
  it("creates a 0700 runtime directory and keeps the socket inside it", () => {
    const base = mkdtempSync(join(tmpdir(), "gnh-ipc-dir-"));
    try {
      const dir = ensureSidecarIpcRuntimeDir({
        platform: "linux",
        runtimeDir: base,
      });
      assert.equal(statSync(dir).mode & 0o777, 0o700);
      const sock = generateSidecarIpcPath({
        platform: "linux",
        dir,
        sessionId: "abc",
      });
      assert.equal(sock, join(dir, "gnh-sidecar-abc.sock"));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("uses a named pipe on Windows", () => {
    const pipe = generateSidecarIpcPath({
      platform: "win32",
      sessionId: "abc",
    });
    assert.equal(pipe, "\\\\.\\pipe\\gnh-sidecar-abc");
  });
});

describe("shared attach token", () => {
  it("prefers the owner lockfile over env and default", () => {
    const resolved = resolveSharedBridgeToken({
      fromLock: "owner-token",
      fromEnv: "env-token",
      hasIpcLock: true,
    });
    assert.deepEqual(resolved, {
      token: "owner-token",
      source: "lock",
      stale: false,
    });
  });

  it("flags a path lock with no token lock as stale", () => {
    const resolved = resolveSharedBridgeToken({
      fromLock: null,
      fromEnv: null,
      hasIpcLock: true,
    });
    assert.equal(resolved.source, "default");
    assert.equal(resolved.stale, true);
  });

  it("does not flag the plain shared default", () => {
    const resolved = resolveSharedBridgeToken({});
    assert.equal(resolved.token, "gnh-desktop-shared");
    assert.equal(resolved.stale, false);
  });
});
