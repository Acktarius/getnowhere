import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTO_LOCK_TIMEOUT_SEC,
  isWalletPresentFromNative,
  normalizeAutoLockTimeoutSec,
  shouldStayLockedOnForeground,
} from "../../native-wrapper/src/nativeLockGate";

describe("shouldStayLockedOnForeground", () => {
  it("releases the gate when no wallet exists, even with a resurfaced enrollment", () => {
    expect(
      shouldStayLockedOnForeground({
        walletPresent: false,
        appAccessEnrolled: true,
        autoLockTimeoutSec: 60,
        backgroundElapsedMs: 10 * 60_000,
      }),
    ).toBe(false);
  });

  it("releases the gate when app access is not enrolled (file picker, onboarding)", () => {
    expect(
      shouldStayLockedOnForeground({
        walletPresent: true,
        appAccessEnrolled: false,
        autoLockTimeoutSec: 60,
        backgroundElapsedMs: 10 * 60_000,
      }),
    ).toBe(false);
  });

  it("releases the gate when auto-lock timeout is disabled (0)", () => {
    expect(
      shouldStayLockedOnForeground({
        walletPresent: true,
        appAccessEnrolled: true,
        autoLockTimeoutSec: 0,
        backgroundElapsedMs: 10 * 60_000,
      }),
    ).toBe(false);
  });

  it("releases the gate for a short background trip under the timeout", () => {
    expect(
      shouldStayLockedOnForeground({
        walletPresent: true,
        appAccessEnrolled: true,
        autoLockTimeoutSec: 60,
        backgroundElapsedMs: 7_697,
      }),
    ).toBe(false);
  });

  it("stays locked when enrolled and elapsed reaches the timeout", () => {
    expect(
      shouldStayLockedOnForeground({
        walletPresent: true,
        appAccessEnrolled: true,
        autoLockTimeoutSec: 60,
        backgroundElapsedMs: 60_000,
      }),
    ).toBe(true);
    expect(
      shouldStayLockedOnForeground({
        walletPresent: true,
        appAccessEnrolled: true,
        autoLockTimeoutSec: 60,
        backgroundElapsedMs: 120_000,
      }),
    ).toBe(true);
  });

  it("fails closed when enrolled and elapsed is unknown", () => {
    expect(
      shouldStayLockedOnForeground({
        walletPresent: true,
        appAccessEnrolled: true,
        autoLockTimeoutSec: DEFAULT_AUTO_LOCK_TIMEOUT_SEC,
        backgroundElapsedMs: undefined,
      }),
    ).toBe(true);
  });
});

describe("isWalletPresentFromNative", () => {
  it("is absent only on an explicit exists:false", () => {
    expect(isWalletPresentFromNative({ exists: false })).toBe(false);
  });

  it("fails closed on exists:true, error reasons, or empty results", () => {
    expect(isWalletPresentFromNative({ exists: true })).toBe(true);
    expect(isWalletPresentFromNative({ reason: "io-error" })).toBe(true);
    expect(isWalletPresentFromNative({ reason: "bridge-unavailable" })).toBe(
      true,
    );
    expect(isWalletPresentFromNative({})).toBe(true);
  });
});

describe("normalizeAutoLockTimeoutSec", () => {
  it("floors and clamps finite numbers", () => {
    expect(normalizeAutoLockTimeoutSec(90.7)).toBe(90);
    expect(normalizeAutoLockTimeoutSec(-5)).toBe(0);
  });

  it("rejects missing or non-finite values", () => {
    expect(normalizeAutoLockTimeoutSec(undefined)).toBeNull();
    expect(normalizeAutoLockTimeoutSec("300")).toBeNull();
    expect(normalizeAutoLockTimeoutSec(Number.NaN)).toBeNull();
    expect(normalizeAutoLockTimeoutSec(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
