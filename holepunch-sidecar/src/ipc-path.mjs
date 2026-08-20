/**
 * Unix socket cleanup before IPC bind.
 * @see docs/architecture/local-bridge-transport.md
 */

import { existsSync, unlinkSync } from "node:fs";

/**
 * Remove a stale filesystem socket path when present (Linux/macOS).
 * Named pipes on Windows are not filesystem entries — no-op there.
 * @param {string} ipcPath
 * @param {NodeJS.Platform} [platform]
 */
export function cleanupStaleIpcPath(ipcPath, platform = process.platform) {
  if (platform === "win32") return;
  if (!ipcPath || !existsSync(ipcPath)) return;
  try {
    unlinkSync(ipcPath);
  } catch {
    /* in use or permission — bind will surface error */
  }
}
