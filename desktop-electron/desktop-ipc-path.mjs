/**
 * Per-session sidecar IPC path for Electron main (Unix socket / named pipe).
 * @see docs/architecture/electron-desktop.md
 */

import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * @param {{ sessionId?: string; platform?: NodeJS.Platform }} [opts]
 * @returns {string}
 */
export function generateSidecarIpcPath(opts = {}) {
  const platform = opts.platform ?? process.platform;
  const id = (opts.sessionId ?? randomUUID()).replace(/[^\w-]/g, "_");
  if (platform === "win32") {
    return `\\\\.\\pipe\\gnh-sidecar-${id}`;
  }
  return join(tmpdir(), `gnh-sidecar-${id}.sock`);
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
