/**
 * In-memory poke limits: per-handle window and a process-wide cap.
 * Keys are never logged. @see docs/features/peer-wake-notification.md
 */

const WINDOW_MS = 5 * 60 * 1000;
const GLOBAL_BURST = 10;
const GLOBAL_REFILL_PER_MS = 1 / 1000;

const lastPokeAt = new Map<string, number>();

let globalTokens = GLOBAL_BURST;
let globalUpdatedAt = 0;

/** @returns false when this handle already consumed a slot in the window. */
export function consumePokeSlot(pokeHandle: string, now = Date.now()): boolean {
  const prev = lastPokeAt.get(pokeHandle);
  if (prev !== undefined && now - prev < WINDOW_MS) return false;
  lastPokeAt.set(pokeHandle, now);
  return true;
}

/**
 * Process-wide poke cap (burst 10, refill 1/s). Call before consumePokeSlot
 * so a rejected spray does not fill the per-handle map.
 */
export function consumeGlobalPokeSlot(now = Date.now()): boolean {
  if (globalUpdatedAt === 0) globalUpdatedAt = now;
  const elapsed = Math.max(0, now - globalUpdatedAt);
  globalTokens = Math.min(
    GLOBAL_BURST,
    globalTokens + elapsed * GLOBAL_REFILL_PER_MS,
  );
  globalUpdatedAt = now;
  if (globalTokens < 1) return false;
  globalTokens -= 1;
  return true;
}

/** Drop expired per-handle entries so the map cannot grow without bound. */
export function pruneRateLimits(now = Date.now()): number {
  let removed = 0;
  for (const [handle, ts] of lastPokeAt) {
    if (now - ts >= WINDOW_MS) {
      lastPokeAt.delete(handle);
      removed += 1;
    }
  }
  return removed;
}

/** Test reset. Not used in production. */
export function _resetPokeRateLimitsForTests(): void {
  lastPokeAt.clear();
  globalTokens = GLOBAL_BURST;
  globalUpdatedAt = 0;
}
