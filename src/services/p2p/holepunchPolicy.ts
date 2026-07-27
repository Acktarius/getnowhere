/**
 * Holepunch transport connection policy (shared constants + docs mirror).
 * Responsibilities: topic join, peer connect, retry/backoff, failure states.
 * Does NOT own invite validation or relationship establishment.
 */

import type { ConnectFailureCode } from "@/types/protocol";

/** 120s HyperDHT discovery deadline; single-flight prevents overlap.
 * @see docs/architecture/holepunch-sidecar.md */
export const HOLEPUNCH_CONNECT_TIMEOUT_MS = 120_000;

/** Max backoff delay between retries (ms). */
export const HOLEPUNCH_BACKOFF_CAP_MS = 60_000;

/** Base delay for attempt 1 before exponential growth (ms). */
export const HOLEPUNCH_BACKOFF_BASE_MS = 1_000;

export function holepunchBackoffMs(attempt: number): number {
  const exp = Math.min(
    HOLEPUNCH_BACKOFF_CAP_MS,
    HOLEPUNCH_BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1),
  );
  const jitter = Math.floor(Math.random() * 250);
  return exp + jitter;
}

export function isRetryableConnectFailure(code: ConnectFailureCode): boolean {
  return code === "timeout" || code === "unreachable" || code === "unknown";
}
