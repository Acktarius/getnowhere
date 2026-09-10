/** SQLite pokeHandle → push token. No user/room/sender fields. @see docs/features/peer-wake-notification.md */

import { randomBytes } from "node:crypto";
import BetterSqlite3 from "better-sqlite3";

export type Platform = "apns";
export type PushEnv = "sandbox" | "production";

export type HandleRow = {
  pokeHandle: string;
  token: string;
  platform: Platform;
  env: PushEnv;
  updatedAt: number;
};

const HANDLE_BYTES = 10;
const MINT_RETRIES = 8;

let db: InstanceType<typeof BetterSqlite3>;

export function openDb(dbPath: string): void {
  db = new BetterSqlite3(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS handles (
      poke_handle TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      platform TEXT NOT NULL,
      env TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
}

export function closeDb(): void {
  db?.close();
}

/** Mint a fresh 14-char base64url handle and insert the row. */
export function createHandle(input: {
  token: string;
  platform: Platform;
  env: PushEnv;
}): string {
  const updatedAt = Date.now();
  const insert = db.prepare(`
    INSERT INTO handles (poke_handle, token, platform, env, updated_at)
    VALUES (@pokeHandle, @token, @platform, @env, @updatedAt)
  `);

  for (let i = 0; i < MINT_RETRIES; i++) {
    const pokeHandle = randomBytes(HANDLE_BYTES).toString("base64url");
    try {
      insert.run({
        pokeHandle,
        token: input.token,
        platform: input.platform,
        env: input.env,
        updatedAt,
      });
      return pokeHandle;
    } catch (err) {
      if (isPrimaryKeyConflict(err)) continue;
      throw err;
    }
  }
  throw new Error("handle_mint_failed");
}

/**
 * Update the OS token for an existing handle (token rotation).
 * Returns true if the row existed and was updated, false if the handle is unknown.
 * @see docs/features/peer-wake-notification.md §7
 */
export function updateHandleToken(pokeHandle: string, token: string): boolean {
  const result = db
    .prepare(
      "UPDATE handles SET token = @token, updated_at = @updatedAt WHERE poke_handle = @pokeHandle",
    )
    .run({ pokeHandle, token, updatedAt: Date.now() });
  return result.changes > 0;
}

export function getHandle(pokeHandle: string): HandleRow | undefined {
  return db
    .prepare(
      `SELECT poke_handle AS pokeHandle, token, platform, env, updated_at AS updatedAt
       FROM handles WHERE poke_handle = ?`,
    )
    .get(pokeHandle) as HandleRow | undefined;
}

export function deleteHandle(pokeHandle: string): void {
  db.prepare("DELETE FROM handles WHERE poke_handle = ?").run(pokeHandle);
}

function isPrimaryKeyConflict(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "SQLITE_CONSTRAINT_PRIMARYKEY"
  );
}
