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

/** Per-IP register bucket; generous because carrier NAT puts many phones on one IP. */
export const REGISTER_IP_BURST = 20;
export const REGISTER_IP_REFILL_MS = 60_000;
export const REGISTER_GLOBAL_BURST = 60;
const REGISTER_GLOBAL_REFILL_MS = 1_000;

type Bucket = { tokens: number; updatedAt: number };

const registerByIp = new Map<string, Bucket>();
let registerGlobal: Bucket = { tokens: REGISTER_GLOBAL_BURST, updatedAt: 0 };

function refill(bucket: Bucket, burst: number, refillMs: number, now: number) {
  if (bucket.updatedAt === 0) bucket.updatedAt = now;
  const elapsed = Math.max(0, now - bucket.updatedAt);
  bucket.tokens = Math.min(burst, bucket.tokens + elapsed / refillMs);
  bucket.updatedAt = now;
}

/**
 * Register limit: global cap first, then per client IP. The IP stays in memory
 * only and is never logged. @returns false when the caller must get 429.
 */
export function consumeRegisterSlot(ip: string, now = Date.now()): boolean {
  refill(registerGlobal, REGISTER_GLOBAL_BURST, REGISTER_GLOBAL_REFILL_MS, now);
  if (registerGlobal.tokens < 1) return false;
  const bucket = registerByIp.get(ip) ?? {
    tokens: REGISTER_IP_BURST,
    updatedAt: now,
  };
  refill(bucket, REGISTER_IP_BURST, REGISTER_IP_REFILL_MS, now);
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  registerGlobal.tokens -= 1;
  registerByIp.set(ip, bucket);
  return true;
}

/** Drop expired per-handle and refilled per-IP entries so the maps stay bounded. */
export function pruneRateLimits(now = Date.now()): number {
  let removed = 0;
  for (const [handle, ts] of lastPokeAt) {
    if (now - ts >= WINDOW_MS) {
      lastPokeAt.delete(handle);
      removed += 1;
    }
  }
  for (const [ip, bucket] of registerByIp) {
    refill(bucket, REGISTER_IP_BURST, REGISTER_IP_REFILL_MS, now);
    if (bucket.tokens >= REGISTER_IP_BURST) {
      registerByIp.delete(ip);
      removed += 1;
    }
  }
  return removed;
}

/** Test reset. Not used in production. */
export function _resetRegisterRateLimitsForTests(): void {
  registerByIp.clear();
  registerGlobal = { tokens: REGISTER_GLOBAL_BURST, updatedAt: 0 };
}

/** Test reset. Not used in production. */
export function _resetPokeRateLimitsForTests(): void {
  lastPokeAt.clear();
  globalTokens = GLOBAL_BURST;
  globalUpdatedAt = 0;
}
