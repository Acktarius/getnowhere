/**
 * Wire mobile app-access lock: lifecycle, idle timer, auth store sync.
 * @see docs/features/app-access-and-data-unlock.md
 */
import { useEffect, useRef } from "react";
import type { AppAccessLockReason } from "@/lib/mobile/AppAccessController";
import {
  checkIdleDeadlineIfDue,
  getAppAccessLockGeneration,
  handleLifecycleEvent,
  isAppAccessLocked,
  noteUserActivity,
  registerMobileLifecycleBridge,
  setAppAccessLockEnabled,
  setAutoLockTimeoutSec,
  setOnAppAccessLock,
} from "@/lib/mobile/AppAccessController";
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";
import { useAuthStore } from "@/state/authStore";
import { useSettingsStore } from "@/state/settingsStore";

/** Call after successful biometric app-access unlock. */
export { completeAppAccessUnlock } from "@/lib/mobile/completeAppAccessUnlock";

function syncBlurInAppSwitcher(enabled: boolean): void {
  window.gnhMobile?.setBlurInAppSwitcher?.(enabled);
}

/** Mobile-only: native lifecycle + idle auto-lock → authStore.lock(). */
export function useMobileAppAccess(): void {
  const lockAuth = useAuthStore((s) => s.lock);
  const autoLockSec = useSettingsStore((s) => s.privacy.autoLockTimeoutSec);
  const blurInAppSwitcher = useSettingsStore(
    (s) => s.privacy.blurInAppSwitcher,
  );
  const appAccessBiometricEnabled = useSettingsStore(
    (s) => s.appAccessBiometricEnabled,
  );
  const onLockRef = useRef<(reason: AppAccessLockReason) => void>(() => {});
  onLockRef.current = (_reason) => {
    lockAuth();
    const gen = getAppAccessLockGeneration();
    window.gnhMobile?.setLockGeneration?.(gen);
  };

  useEffect(() => {
    if (!isMobileHost()) return;
    syncBlurInAppSwitcher(blurInAppSwitcher);
  }, [blurInAppSwitcher]);

  useEffect(() => {
    if (!isMobileHost()) return;

    setAutoLockTimeoutSec(autoLockSec);
    setAppAccessLockEnabled(appAccessBiometricEnabled);
    setOnAppAccessLock((reason) => onLockRef.current(reason));

    const unsubLifecycle = registerMobileLifecycleBridge();
    if (isAppAccessLocked()) {
      lockAuth();
    } else {
      noteUserActivity();
    }

    window.ReactNativeWebView?.postMessage(
      JSON.stringify({
        channel: "gnh-lifecycle",
        direction: "event",
        type: "ui-ready",
      }),
    );

    const onActivity = () => noteUserActivity();
    window.addEventListener("pointerdown", onActivity, { passive: true });
    window.addEventListener("touchstart", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        handleLifecycleEvent("background");
      } else {
        checkIdleDeadlineIfDue();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      unsubLifecycle();
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("touchstart", onActivity);
      window.removeEventListener("keydown", onActivity);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [lockAuth, autoLockSec, appAccessBiometricEnabled]);
}
