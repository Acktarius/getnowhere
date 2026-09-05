import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _clearIdleLockTimerForTests,
  _resetAppAccessControllerForTests,
  APP_ACCESS_BACKGROUND_AT_KEY,
  checkIdleDeadlineIfDue,
  getAppAccessLockGeneration,
  getAppAccessState,
  handleLifecycleEvent,
  isAppAccessLocked,
  isAppInBackground,
  isSensitiveActionAllowed,
  lockAppAccess,
  noteUserActivity,
  setAppAccessLockEnabled,
  setAutoLockTimeoutSec,
  setOnAppAccessLock,
  unlockAppAccess,
} from "@/lib/mobile/AppAccessController";

describe("AppAccessController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetAppAccessControllerForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    _resetAppAccessControllerForTests();
  });

  it("increments lockGeneration on each lock", () => {
    expect(getAppAccessLockGeneration()).toBe(0);
    const g1 = lockAppAccess("manual");
    expect(g1).toBe(1);
    unlockAppAccess();
    const g2 = lockAppAccess("manual");
    expect(g2).toBe(2);
  });

  it("blocks sensitive actions while locked", () => {
    const gen = lockAppAccess("manual");
    expect(isAppAccessLocked()).toBe(true);
    expect(isSensitiveActionAllowed()).toBe(false);
    expect(isSensitiveActionAllowed(gen)).toBe(false);
    unlockAppAccess();
    expect(isSensitiveActionAllowed()).toBe(true);
  });

  it("fires idle lock after autoLockTimeoutSec when enabled", () => {
    const onLock = vi.fn();
    setOnAppAccessLock(onLock);
    setAppAccessLockEnabled(true);
    unlockAppAccess();
    onLock.mockClear();
    setAutoLockTimeoutSec(60);
    noteUserActivity();
    vi.advanceTimersByTime(59_999);
    expect(isAppAccessLocked()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(isAppAccessLocked()).toBe(true);
    expect(onLock).toHaveBeenCalledWith("idle");
    expect(getAppAccessState().reason).toBe("idle");
  });

  it("does not idle-lock when app access lock is disabled", () => {
    setAppAccessLockEnabled(false);
    setAutoLockTimeoutSec(30);
    noteUserActivity();
    vi.advanceTimersByTime(60_000);
    expect(isAppAccessLocked()).toBe(false);
  });

  it("does not lock immediately on background when enabled", () => {
    setAppAccessLockEnabled(true);
    unlockAppAccess();
    setAutoLockTimeoutSec(60);
    handleLifecycleEvent("background");
    expect(isAppAccessLocked()).toBe(false);
  });

  it("locks on foreground after background exceeds auto-lock", () => {
    const onLock = vi.fn();
    setOnAppAccessLock(onLock);
    setAppAccessLockEnabled(true);
    unlockAppAccess();
    onLock.mockClear();
    setAutoLockTimeoutSec(60);
    const start = Date.now();
    vi.setSystemTime(start);
    handleLifecycleEvent("background");
    vi.setSystemTime(start + 61_000);
    handleLifecycleEvent("foreground");
    expect(isAppAccessLocked()).toBe(true);
    expect(onLock).toHaveBeenCalledWith("background");
    expect(getAppAccessState().reason).toBe("background");
  });

  it("does not lock on foreground when background was shorter than auto-lock", () => {
    setAppAccessLockEnabled(true);
    unlockAppAccess();
    setAutoLockTimeoutSec(60);
    const start = Date.now();
    vi.setSystemTime(start);
    handleLifecycleEvent("background");
    vi.setSystemTime(start + 30_000);
    handleLifecycleEvent("foreground");
    expect(isAppAccessLocked()).toBe(false);
  });

  it("does not lock on background when disabled", () => {
    setAppAccessLockEnabled(false);
    handleLifecycleEvent("background");
    vi.advanceTimersByTime(120_000);
    handleLifecycleEvent("foreground");
    expect(isAppAccessLocked()).toBe(false);
  });

  it("isAppInBackground follows native lifecycle even when lock is off", () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    setAppAccessLockEnabled(false);
    expect(isAppInBackground()).toBe(false);
    handleLifecycleEvent("background");
    expect(isAppInBackground()).toBe(true);
    expect(isAppAccessLocked()).toBe(false);
    handleLifecycleEvent("foreground");
    expect(isAppInBackground()).toBe(false);
  });

  it("foreground while locked does not auto-unlock", () => {
    lockAppAccess("manual");
    handleLifecycleEvent("foreground");
    expect(isAppAccessLocked()).toBe(true);
  });

  it("locks on foreground when native reports background elapsed (JS missed background)", () => {
    const onLock = vi.fn();
    setOnAppAccessLock(onLock);
    setAppAccessLockEnabled(true);
    unlockAppAccess();
    onLock.mockClear();
    setAutoLockTimeoutSec(60);
    handleLifecycleEvent("foreground", 90_000);
    expect(isAppAccessLocked()).toBe(true);
    expect(onLock).toHaveBeenCalledWith("background");
    expect(getAppAccessState().reason).toBe("background");
  });

  it("does not lock merely because app access was enabled", () => {
    const onLock = vi.fn();
    setOnAppAccessLock(onLock);
    setAutoLockTimeoutSec(900);
    setAppAccessLockEnabled(true);
    expect(isAppAccessLocked()).toBe(false);
    expect(onLock).not.toHaveBeenCalled();
  });

  it("does not lock after a short background when auto-lock is 15 minutes", () => {
    setAppAccessLockEnabled(true);
    setAutoLockTimeoutSec(900);
    const start = Date.now();
    vi.setSystemTime(start);
    handleLifecycleEvent("background");
    vi.setSystemTime(start + 120_000);
    handleLifecycleEvent("foreground");
    expect(isAppAccessLocked()).toBe(false);
  });

  it("re-enable after WKWebView remount uses persisted background time", () => {
    setAutoLockTimeoutSec(900);
    setAppAccessLockEnabled(true);
    const start = Date.now();
    vi.setSystemTime(start);
    handleLifecycleEvent("background");
    vi.setSystemTime(start + 120_000);
    const saved = localStorage.getItem(APP_ACCESS_BACKGROUND_AT_KEY);
    expect(saved).toBeTruthy();
    _resetAppAccessControllerForTests();
    localStorage.setItem(APP_ACCESS_BACKGROUND_AT_KEY, saved!);
    setAutoLockTimeoutSec(900);
    setAppAccessLockEnabled(true);
    expect(isAppAccessLocked()).toBe(false);
  });

  it("locks on remount when persisted background exceeds auto-lock", () => {
    setAutoLockTimeoutSec(60);
    setAppAccessLockEnabled(true);
    const start = Date.now();
    vi.setSystemTime(start);
    handleLifecycleEvent("background");
    vi.setSystemTime(start + 120_000);
    const saved = localStorage.getItem(APP_ACCESS_BACKGROUND_AT_KEY);
    _resetAppAccessControllerForTests();
    localStorage.setItem(APP_ACCESS_BACKGROUND_AT_KEY, saved!);
    setAutoLockTimeoutSec(60);
    setAppAccessLockEnabled(true);
    expect(isAppAccessLocked()).toBe(true);
    expect(getAppAccessState().reason).toBe("background");
  });

  it("checkIdleDeadlineIfDue locks when timer was cleared", () => {
    const onLock = vi.fn();
    setOnAppAccessLock(onLock);
    setAppAccessLockEnabled(true);
    unlockAppAccess();
    onLock.mockClear();
    setAutoLockTimeoutSec(60);
    const start = Date.now();
    vi.setSystemTime(start);
    noteUserActivity();
    _clearIdleLockTimerForTests();
    vi.setSystemTime(start + 61_000);
    checkIdleDeadlineIfDue();
    expect(isAppAccessLocked()).toBe(true);
    expect(onLock).toHaveBeenCalledWith("idle");
  });
});
