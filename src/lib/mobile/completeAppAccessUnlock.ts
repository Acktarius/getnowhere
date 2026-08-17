import {
  getAppAccessLockGeneration,
  unlockAppAccess as unlockAppAccessController,
} from "@/lib/mobile/AppAccessController";
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";

/** Call after successful biometric app-access unlock. */
export function completeAppAccessUnlock(): void {
  if (!isMobileHost()) return;
  unlockAppAccessController();
  const gen = getAppAccessLockGeneration();
  window.gnhMobile?.setLockGeneration?.(gen);
}
