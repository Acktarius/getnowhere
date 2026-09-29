import { unlockAppAccess as unlockAppAccessController } from "@/lib/mobile/AppAccessController";
import { isMobileHost } from "@/lib/mobile/gnhMobileBridgeTypes";

/**
 * Call after successful biometric app-access unlock.
 * Bridge `lockGeneration` is native-owned; never overwrite it from the UI.
 * @see native-wrapper/docs/gnh-mobile-security-bridge.md
 */
export function completeAppAccessUnlock(): void {
  if (!isMobileHost()) return;
  unlockAppAccessController();
}
