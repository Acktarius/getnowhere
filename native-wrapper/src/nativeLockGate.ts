/**
 * Native app-access gate: mirror AppAccessController's foreground lock rule.
 * @see native-wrapper/docs/gnh-mobile-security-bridge.md
 */

/** Matches AppAccessController default until the WebView syncs its setting. */
export const DEFAULT_AUTO_LOCK_TIMEOUT_SEC = 300;

export type ForegroundLockInput = {
  /** False only when native reported the wallet file definitively absent. */
  walletPresent: boolean;
  appAccessEnrolled: boolean;
  autoLockTimeoutSec: number;
  backgroundElapsedMs: number | undefined;
};

/** True when the native gate must stay locked until biometric unlockAppAccess. */
export function shouldStayLockedOnForeground(
  input: ForegroundLockInput,
): boolean {
  if (!input.walletPresent) return false;
  if (!input.appAccessEnrolled) return false;
  if (input.autoLockTimeoutSec <= 0) return false;
  if (typeof input.backgroundElapsedMs !== "number") return true;
  return input.backgroundElapsedMs >= input.autoLockTimeoutSec * 1000;
}

/** Wallet counts as absent only on an explicit `{ exists: false }`; errors fail closed. */
export function isWalletPresentFromNative(result: {
  exists?: boolean;
  reason?: string;
}): boolean {
  return !(result.exists === false && !result.reason);
}

/** Normalize a WebView-supplied timeout; null when absent or not finite. */
export function normalizeAutoLockTimeoutSec(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.floor(value));
}
