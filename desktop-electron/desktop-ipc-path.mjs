/**
 * Per-session sidecar IPC path for Electron main (Unix socket / named pipe).
 * @see docs/architecture/electron-desktop.md
 * @see docs/architecture/local-bridge-transport.md
 */

import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Private directory for the Unix socket. Empty on Windows (named pipe).
 * @param {{ platform?: NodeJS.Platform; runtimeDir?: string }} [opts]
 * @returns {string}
 */
export function ensureSidecarIpcRuntimeDir(opts = {}) {
  const platform = opts.platform ?? process.platform;
  if (platform === "win32") return "";
  const base = opts.runtimeDir ?? (process.env.XDG_RUNTIME_DIR?.trim() || tmpdir());
  const dir = join(base, "gnh-sidecar");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  return dir;
}

/**
 * @param {{ sessionId?: string; platform?: NodeJS.Platform; dir?: string }} [opts]
 * @returns {string}
 */
export function generateSidecarIpcPath(opts = {}) {
  const platform = opts.platform ?? process.platform;
  const id = (opts.sessionId ?? randomUUID()).replace(/[^\w-]/g, "_");
  if (platform === "win32") {
    return `\\\\.\\pipe\\gnh-sidecar-${id}`;
  }
  const dir = opts.dir ?? ensureSidecarIpcRuntimeDir({ platform });
  return join(dir, `gnh-sidecar-${id}.sock`);
}

/**
 * Lockfile basename for shared-mode IPC path handoff.
 * @param {string} host
 * @param {string} [roleSlug]
 */
export function sharedIpcLockBasename(host, roleSlug = "shared") {
  const safeHost = host.replace(/[^\w.-]/g, "_");
  return `gnh-sidecar-${safeHost}-${roleSlug}.ipc`;
}

/**
 * Shared-mode attach token. A path lock with no token lock means the owner's
 * token is unknown, so the default would fail auth — report it as `stale`.
 * @param {{ fromLock?: string | null; fromEnv?: string | null; hasIpcLock?: boolean }} opts
 * @returns {{ token: string; source: "lock" | "env" | "default"; stale: boolean }}
 */
export function resolveSharedBridgeToken(opts = {}) {
  const fromLock = opts.fromLock || null;
  const fromEnv = opts.fromEnv || null;
  if (fromLock) return { token: fromLock, source: "lock", stale: false };
  if (fromEnv) return { token: fromEnv, source: "env", stale: false };
  return {
    token: "gnh-desktop-shared",
    source: "default",
    stale: opts.hasIpcLock === true,
  };
}
