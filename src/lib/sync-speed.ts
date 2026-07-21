/**
 * Wallet sync intensity — the "Sync speed" setting, themed after the DOOM skill levels. It maps to a
 * concrete {@link SyncProfile} that drives the real deep-sync engine knobs: the Web Worker scan-pool
 * size, the per-batch block count, and how many pool nodes a multi-source catch-up fans across.
 * Higher = faster, but more CPU + network. "Nightmare!" holds nothing back (all cores, biggest
 * batch, most nodes) and will make the UI sweat — that's the point.
 *
 * Pure + engine-free (imported by BOTH the settings UI and the SDK runtime), so it never pulls the
 * engine into mock mode. The persisted value stays the `options.readSpeed` NUMBER so existing wallets
 * keep loading; each level owns a stable readSpeed id. These ids are DELIBERATELY disjoint from the
 * legacy v1 values (2/10/50/100) — under the old engine `readSpeed` was a dead no-op, so a wallet
 * that happens to carry one of those resets to the default level rather than silently jumping to an
 * aggressive worker pool it never knowingly chose (GLM review).
 */
export type SyncSpeed =
  | "tooYoung"
  | "notTooRough"
  | "hurtMePlenty"
  | "ultraViolence"
  | "nightmare";

/** Ordered gentlest → most brutal (drives the selector order). */
export const SYNC_SPEED_OPTIONS: SyncSpeed[] = [
  "tooYoung",
  "notTooRough",
  "hurtMePlenty",
  "ultraViolence",
  "nightmare",
];

/** The level chosen when nothing is set / an unknown legacy value is read. */
export const DEFAULT_SYNC_SPEED: SyncSpeed = "hurtMePlenty";

/**
 * Persisted `readSpeed` id per level — opaque (nothing reads the magnitude), just stable + disjoint
 * from the legacy no-op values {2, 10, 50, 100} so those resolve to the default, not a real level.
 */
const READ_SPEED_BY_SYNC: Record<SyncSpeed, number> = {
  tooYoung: 1,
  notTooRough: 3,
  hurtMePlenty: 4,
  ultraViolence: 6,
  nightmare: 8,
};

/** DOOM skill-level names (rendered verbatim in the selector — an intentional English Easter egg). */
export const SYNC_SPEED_LABELS: Record<SyncSpeed, string> = {
  tooYoung: "I'm too young to die",
  notTooRough: "Hey, not too rough",
  hurtMePlenty: "Hurt me plenty",
  ultraViolence: "Ultra-Violence",
  nightmare: "Nightmare!",
};

/** Concrete engine knobs a level dials in (consumed by runtime.ts syncOnce + scan-pool). */
export type SyncProfile = {
  /** Web Worker scan-pool size for the deep-sync fold. 0 = in-thread (no pool). Capped to cores. */
  workers: number;
  /** Blocks fetched per sync batch (the daemon/fetchSyncRange split a too-large range safely). */
  batchBlocks: number;
  /** Max nodes a deep multi-source catch-up fans across (home + peers). 1 = home only. */
  maxSources: number;
};

/**
 * Per-level profiles. The default (Hurt me plenty) engages the Web Worker scan pool — the legacy
 * wallet-core always screened txs off the main thread (`ParseWorker` pool), and running the ECDH
 * fold in-thread freezes the UI on phones (Pixel/Android included). Only "I'm too young to die"
 * stays in-thread (battery-saver); it still yields cooperatively so the UI can paint. Nightmare =
 * all cores + the biggest batch + the most nodes.
 */
export const SYNC_PROFILES: Record<SyncSpeed, SyncProfile> = {
  tooYoung: { workers: 0, batchBlocks: 100, maxSources: 1 },
  notTooRough: { workers: 2, batchBlocks: 200, maxSources: 2 },
  hurtMePlenty: { workers: 4, batchBlocks: 250, maxSources: 3 },
  ultraViolence: { workers: 4, batchBlocks: 500, maxSources: 4 },
  nightmare: { workers: 8, batchBlocks: 1000, maxSources: 6 },
};

export function readSpeedFromSyncSpeed(speed: SyncSpeed): number {
  return READ_SPEED_BY_SYNC[speed];
}

/** Resolve a persisted `readSpeed` number back to a level (exact match, else the default). */
export function syncSpeedFromReadSpeed(readSpeed: number): SyncSpeed {
  const match = SYNC_SPEED_OPTIONS.find(
    (speed) => READ_SPEED_BY_SYNC[speed] === readSpeed,
  );
  return match ?? DEFAULT_SYNC_SPEED;
}

/** The engine profile for a level. */
export function syncProfileFor(speed: SyncSpeed): SyncProfile {
  return SYNC_PROFILES[speed];
}

/** The engine profile for a persisted `readSpeed` (what the runtime reads off `options.readSpeed`). */
export function syncProfileFromReadSpeed(readSpeed: number): SyncProfile {
  return SYNC_PROFILES[syncSpeedFromReadSpeed(readSpeed)];
}
