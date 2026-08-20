/**
 * Mobile app-access lock orchestration (UI gate — does not unmount wallet).
 * @see docs/features/app-access-and-data-unlock.md
 */
import type { GnhLifecycleType } from "@/lib/mobile/gnhMobileBridgeTypes";
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";

export type AppAccessLockReason =
  | "idle"
  | "background"
  | "screenOff"
  | "manual"
  | "lifecycle";

export type AppAccessState = {
  locked: boolean;
  lockGeneration: number;
  reason: AppAccessLockReason | null;
};

type LifecycleHandler = (type: GnhLifecycleType) => void;

let lockGeneration = 0;
let locked = false;
let lockReason: AppAccessLockReason | null = null;
let idleTimeoutSec = 300;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let onLockCallback: ((reason: AppAccessLockReason) => void) | null = null;
let lifecycleUnsub: (() => void) | null = null;
const lifecycleHandlers = new Set<LifecycleHandler>();
let appAccessLockEnabled = false;
let backgroundSinceMs: number | null = null;
let coldStartEngaged = false;
let lastActivityAtMs = Date.now();
/** Last native/WebView lifecycle type — independent of the app-access lock. */
let lastLifecycleType: GnhLifecycleType = "foreground";
const lockListeners = new Set<() => void>();

function notifyLockListeners(): void {
  for (const listener of lockListeners) {
    try {
      listener();
    } catch {
      /* ignore */
    }
  }
}

/** Subscribe to app-access lock changes (for React useSyncExternalStore). */
export function subscribeAppAccessLock(onChange: () => void): () => void {
  lockListeners.add(onChange);
  return () => {
    lockListeners.delete(onChange);
  };
}

function armIdleTracking(): void {
  lastActivityAtMs = Date.now();
  scheduleIdleTimer();
}

function disarmIdleTracking(): void {
  clearIdleTimer();
}

function clearIdleTimer(): void {
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function scheduleIdleTimer(): void {
  clearIdleTimer();
  if (!appAccessLockEnabled || locked || idleTimeoutSec <= 0) return;
  idleTimer = setTimeout(() => {
    lock("idle");
    onLockCallback?.("idle");
  }, idleTimeoutSec * 1000);
}

function engageColdStartLock(): void {
  if (coldStartEngaged || locked) return;
  coldStartEngaged = true;
  lock("lifecycle");
  onLockCallback?.("lifecycle");
}

/** Current monotonic lock generation (incremented on each lock). */
export function getAppAccessLockGeneration(): number {
  return lockGeneration;
}

export function getAppAccessState(): AppAccessState {
  return { locked, lockGeneration, reason: lockReason };
}

export function isAppAccessLocked(): boolean {
  return locked;
}

/**
 * True when the app is not interactively in the foreground.
 * Uses native lifecycle when present; Page Visibility is a fallback.
 * `getAppAccessState().reason === "background"` is a lock reason set on
 * *return*, not a live background flag — do not use it for this.
 */
export function isAppInBackground(): boolean {
  if (
    typeof document !== "undefined" &&
    document.visibilityState === "hidden"
  ) {
    return true;
  }
  return (
    lastLifecycleType === "background" || lastLifecycleType === "screenOff"
  );
}

/** True when sensitive wallet/chat UI actions may proceed. */
export function isSensitiveActionAllowed(atGeneration?: number): boolean {
  if (!locked) return true;
  if (atGeneration === undefined) return false;
  return atGeneration === lockGeneration && !locked;
}

/** Throws when app access is locked (for store/action gates). */
export function assertAppAccessUnlocked(): void {
  if (locked) {
    throw new Error("App access locked");
  }
}

/** Lock app access; increments lockGeneration. Does not touch wallet runtime. */
export function lockAppAccess(reason: AppAccessLockReason): number {
  locked = true;
  lockReason = reason;
  lockGeneration += 1;
  disarmIdleTracking();
  notifyLockListeners();
  return lockGeneration;
}

/** Alias for lockAppAccess — matches brainstorm naming. */
export function lock(reason: AppAccessLockReason): number {
  return lockAppAccess(reason);
}

/** Unlock app access; does not change lockGeneration. */
export function unlockAppAccess(): void {
  locked = false;
  lockReason = null;
  backgroundSinceMs = null;
  if (appAccessLockEnabled) armIdleTracking();
  notifyLockListeners();
}

/** Enable/disable app-access auto-lock (mobile app biometrics setting). */
export function setAppAccessLockEnabled(enabled: boolean): void {
  appAccessLockEnabled = enabled;
  if (!enabled) {
    disarmIdleTracking();
    backgroundSinceMs = null;
    coldStartEngaged = false;
    if (locked) unlockAppAccess();
    return;
  }
  engageColdStartLock();
  if (!locked) armIdleTracking();
}

/** Configure idle auto-lock timeout (seconds). 0 disables idle lock. */
export function setAutoLockTimeoutSec(sec: number): void {
  idleTimeoutSec = Math.max(0, Math.floor(sec));
  if (appAccessLockEnabled && !locked) armIdleTracking();
}

export function setOnAppAccessLock(
  handler: (reason: AppAccessLockReason) => void,
): void {
  onLockCallback = handler;
}

/** Reset idle timer on user activity while unlocked. */
export function noteUserActivity(): void {
  if (appAccessLockEnabled && !locked) {
    lastActivityAtMs = Date.now();
    scheduleIdleTimer();
  }
}

/** Event-driven idle check when visible (no polling). */
export function checkIdleDeadlineIfDue(): void {
  if (!appAccessLockEnabled || locked || idleTimeoutSec <= 0) return;
  if (Date.now() - lastActivityAtMs >= idleTimeoutSec * 1000) {
    lock("idle");
    onLockCallback?.("idle");
  }
}

export function onAppAccessLifecycle(handler: LifecycleHandler): () => void {
  lifecycleHandlers.add(handler);
  return () => {
    lifecycleHandlers.delete(handler);
  };
}

function dispatchLifecycle(
  type: GnhLifecycleType,
  backgroundElapsedMs?: number,
): void {
  lastLifecycleType = type;

  for (const h of lifecycleHandlers) {
    try {
      h(type);
    } catch {
      /* ignore */
    }
  }

  if (!appAccessLockEnabled) {
    if (type === "foreground") backgroundSinceMs = null;
    return;
  }

  if (type === "foreground") {
    if (locked) return;
    let elapsedMs: number | null = null;
    if (typeof backgroundElapsedMs === "number" && backgroundElapsedMs >= 0) {
      elapsedMs = backgroundElapsedMs;
    } else if (backgroundSinceMs !== null) {
      elapsedMs = Date.now() - backgroundSinceMs;
    }
    if (typeof console !== "undefined") {
      console.warn("[gnh-lifecycle] foreground", {
        backgroundElapsedMs,
        elapsedMs,
        idleTimeoutSec,
        locked,
        appAccessLockEnabled,
      });
    }
    if (
      elapsedMs !== null &&
      idleTimeoutSec > 0 &&
      elapsedMs >= idleTimeoutSec * 1000
    ) {
      lock("background");
      onLockCallback?.("background");
      backgroundSinceMs = null;
      return;
    }
    backgroundSinceMs = null;
    if (!locked) armIdleTracking();
    return;
  }

  if (type === "background" || type === "screenOff") {
    disarmIdleTracking();
    if (!locked) backgroundSinceMs = Date.now();
  }
}

/** Handle lifecycle from native shell or tests. */
export function handleLifecycleEvent(
  type: GnhLifecycleType,
  backgroundElapsedMs?: number,
): void {
  dispatchLifecycle(type, backgroundElapsedMs);
}

/** Wire gnhMobile.onLifecycle when present (mobile host only). */
export function registerMobileLifecycleBridge(): () => void {
  if (!isMobileHost()) return () => {};
  const bridge = window.gnhMobile as {
    onLifecycle?: (
      handler: (evt: { type: GnhLifecycleType }) => void,
    ) => () => void;
  };
  if (typeof bridge.onLifecycle !== "function") return () => {};
  if (lifecycleUnsub) lifecycleUnsub();
  lifecycleUnsub = bridge.onLifecycle((evt) => {
    const e = evt as { type: GnhLifecycleType; backgroundElapsedMs?: number };
    handleLifecycleEvent(e.type, e.backgroundElapsedMs);
  });
  return () => {
    lifecycleUnsub?.();
    lifecycleUnsub = null;
  };
}

/** Test reset — not for production. */
export function _resetAppAccessControllerForTests(): void {
  disarmIdleTracking();
  lockGeneration = 0;
  locked = false;
  lockReason = null;
  idleTimeoutSec = 300;
  onLockCallback = null;
  lifecycleHandlers.clear();
  lifecycleUnsub?.();
  lifecycleUnsub = null;
  appAccessLockEnabled = false;
  backgroundSinceMs = null;
  coldStartEngaged = false;
  lastActivityAtMs = Date.now();
  lastLifecycleType = "foreground";
  lockListeners.clear();
}

/** Clear idle timer in tests that use manual lifecycle timing. */
export function _clearIdleLockTimerForTests(): void {
  clearIdleTimer();
}
