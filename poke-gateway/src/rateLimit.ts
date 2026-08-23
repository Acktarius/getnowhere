/** In-memory 1 poke / 5 min / handle. Keys are never logged. */

const WINDOW_MS = 5 * 60 * 1000;

const lastPokeAt = new Map<string, number>();

/** @returns false when this handle already consumed a slot in the window. */
export function consumePokeSlot(pokeHandle: string, now = Date.now()): boolean {
  const prev = lastPokeAt.get(pokeHandle);
  if (prev !== undefined && now - prev < WINDOW_MS) return false;
  lastPokeAt.set(pokeHandle, now);
  return true;
}

/** Drop expired entries so the map cannot grow without bound. */
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
