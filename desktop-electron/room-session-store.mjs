/**
 * Device-local room-session file for the Electron main process.
 * OS keystore via safeStorage, or "wallet" when Linux has no secret service.
 * @see docs/architecture/electron-desktop.md
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const ROOM_SESSIONS_FILE = "room-sessions.bin";

/** @param {string | undefined} backend safeStorage.getSelectedStorageBackend() */
export function roomSessionMode(backend) {
  return backend === "basic_text" ? "wallet" : "os";
}

/**
 * @param {{
 *   userData: string,
 *   safeStorage: {
 *     getSelectedStorageBackend: () => string,
 *     encryptString: (plain: string) => Buffer,
 *     decryptString: (buf: Buffer) => string,
 *   },
 *   fs?: {
 *     existsSync: (path: string) => boolean,
 *     readFileSync: (path: string) => Buffer,
 *     writeFileSync: (path: string, data: Buffer) => void,
 *     unlinkSync: (path: string) => void,
 *   },
 * }} deps
 */
export function createRoomSessionHost(deps) {
  const fs = deps.fs ?? {
    existsSync,
    readFileSync,
    writeFileSync,
    unlinkSync,
  };
  const file = join(deps.userData, ROOM_SESSIONS_FILE);

  function mode() {
    try {
      return roomSessionMode(deps.safeStorage.getSelectedStorageBackend());
    } catch {
      return "wallet";
    }
  }

  return {
    mode,
    load() {
      if (mode() === "wallet") return { mode: "wallet" };
      if (!fs.existsSync(file)) return { mode: "os", json: null };
      const json = deps.safeStorage.decryptString(fs.readFileSync(file));
      return { mode: "os", json };
    },
    save(json) {
      if (typeof json !== "string") throw new Error("room sessions payload");
      if (mode() === "wallet") return { mode: "wallet" };
      fs.writeFileSync(file, deps.safeStorage.encryptString(json));
      return { mode: "os" };
    },
    clear() {
      try {
        fs.unlinkSync(file);
      } catch {
        /* already gone */
      }
    },
  };
}
