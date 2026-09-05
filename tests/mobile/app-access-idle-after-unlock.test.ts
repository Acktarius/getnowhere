import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetAppAccessControllerForTests,
  isAppAccessLocked,
  noteUserActivity,
  setAppAccessLockEnabled,
  setAutoLockTimeoutSec,
  setOnAppAccessLock,
  unlockAppAccess,
} from "@/lib/mobile/AppAccessController";

/** Regression: cold-start lock + auth unlock must arm idle timer. */
describe("app-access idle after unlock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetAppAccessControllerForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    _resetAppAccessControllerForTests();
  });

  it("idle-locks after biometric unlock when left inactive", () => {
    const onLock = vi.fn();
    setOnAppAccessLock(onLock);

    setAppAccessLockEnabled(true);
    expect(isAppAccessLocked()).toBe(false);

    unlockAppAccess();
    onLock.mockClear();

    setAutoLockTimeoutSec(60);
    noteUserActivity();

    vi.advanceTimersByTime(60_000);
    expect(isAppAccessLocked()).toBe(true);
    expect(onLock).toHaveBeenCalledWith("idle");
  });
});
