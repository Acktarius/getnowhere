/**
 * Token-bucket rate limiter for bridge commands (Bare parity).
 * @see native-wrapper/bare/rateLimit.mjs
 * @see docs/architecture/holepunch-sidecar.md
 */

/**
 * @param {{ capacity: number, refillPerMs: number }} opts
 */
export function createTokenBucket({ capacity, refillPerMs }) {
  let tokens = capacity;
  let lastRefill = Date.now();

  return {
    tryConsume(cost = 1) {
      const now = Date.now();
      const elapsed = now - lastRefill;
      if (elapsed > 0) {
        tokens = Math.min(capacity, tokens + elapsed * refillPerMs);
        lastRefill = now;
      }
      if (tokens >= cost) {
        tokens -= cost;
        return true;
      }
      return false;
    },
  };
}

/** Burst-tolerant defaults; frame limit supports active chat. */
export const BRIDGE_RATE_LIMITS = Object.freeze({
  join: { capacity: 8, refillPerMs: 2 / 1000 },
  leave: { capacity: 8, refillPerMs: 2 / 1000 },
  frame: { capacity: 40, refillPerMs: 40 / 1000 },
  ping: { capacity: 10, refillPerMs: 10 / 1000 },
});

const MiB = 1024 * 1024;

/**
 * Unauthenticated Hyperswarm ingress (tighter than the local bridge).
 * @see docs/architecture/holepunch-sidecar.md
 */
export const SWARM_INGRESS_LIMITS = Object.freeze({
  frame: { capacity: 20, refillPerMs: 10 / 1000 },
  bytes: { capacity: 8 * MiB, refillPerMs: (4 * MiB) / 1000 },
});

/** Live inbound remote streams (not rooms). Outbound still accepted at cap. */
export const DEFAULT_MAX_REMOTE_CONNECTIONS = 8;

/** Consecutive frame-limit drops before the peer stream is destroyed. */
export const DEFAULT_MAX_INGRESS_VIOLATIONS = 8;

/** @param {typeof BRIDGE_RATE_LIMITS} [limits] */
export function createBridgeRateLimiters(limits = BRIDGE_RATE_LIMITS) {
  /** @type {Record<string, ReturnType<typeof createTokenBucket>>} */
  const buckets = {};
  for (const [type, cfg] of Object.entries(limits)) {
    buckets[type] = createTokenBucket(cfg);
  }
  return buckets;
}

/**
 * @param {Record<string, ReturnType<typeof createTokenBucket>>} buckets
 * @param {string} type
 */
export function consumeRateLimit(buckets, type) {
  const bucket = buckets[type];
  return bucket ? bucket.tryConsume() : true;
}
